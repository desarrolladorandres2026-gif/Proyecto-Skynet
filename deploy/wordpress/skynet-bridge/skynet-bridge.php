<?php
/**
 * Plugin Name: Skynet Bridge
 * Description: Expone por REST las solicitudes (PQRS y demás radicados) del módulo Form-Terminal del tema terminal-theme para que Skynet las gestione, y publica en la consulta de radicado la respuesta (nota y PDF) que deja el Terminal. No crea radicados.
 * Version:     1.2.0
 * Author:      Terminal de Transportes de Neiva
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Namespace: /wp-json/skynet/v1
 *
 * Autenticación: la misma contraseña de aplicación que Skynet ya usa para
 * noticias y eventos. Todas las rutas REST exigen `manage_options`, el mismo
 * permiso con el que el tema protege la pantalla "Bandeja de Respuestas".
 *
 * Depende de Terminal_Forms_DB (tema terminal-theme). Si el tema cambia y la
 * clase no existe, las rutas responden 503 en vez de romper el sitio.
 *
 * Lo único público es admin-ajax `skynet_respuesta_publica`: devuelve la nota
 * y el PDF de respuesta de un radicado a quien conozca su número Y el correo
 * con el que lo radicó (los números son consecutivos, el número solo no basta).
 */
class Skynet_Bridge {

	const ESTADOS  = array( 'unread', 'read', 'processed' );
	const VERSION  = '1.2.0';
	const MAX_PDF  = 10485760; // 10 MB.
	const MAX_NOTA = 3000;

	public static function init() {
		add_action( 'plugins_loaded', array( __CLASS__, 'instalar_si_hace_falta' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'registrar_rutas' ) );
		add_action( 'wp_ajax_nopriv_skynet_respuesta_publica', array( __CLASS__, 'ajax_respuesta_publica' ) );
		add_action( 'wp_ajax_skynet_respuesta_publica', array( __CLASS__, 'ajax_respuesta_publica' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'encolar_script_publico' ) );
	}

	private static function tabla_respuestas() {
		global $wpdb;
		return $wpdb->prefix . 'skynet_respuestas';
	}

	/**
	 * Tabla propia de respuestas: no se mezcla con las respuestas del
	 * ciudadano (terminal_form_values) para no alterar la ficha del tema.
	 */
	public static function instalar_si_hace_falta() {
		if ( get_option( 'skynet_bridge_db' ) === self::VERSION ) {
			return;
		}
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$tabla   = self::tabla_respuestas();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$tabla} (
				id bigint(20) unsigned NOT NULL auto_increment,
				submission_id bigint(20) unsigned NOT NULL,
				nota text NULL,
				archivo_url text NULL,
				archivo_nombre varchar(255) NULL,
				archivo_ruta text NULL,
				autor varchar(100) NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY submission_id (submission_id)
			) {$charset};"
		);
		update_option( 'skynet_bridge_db', self::VERSION );
	}

	public static function registrar_rutas() {
		$permiso = array( __CLASS__, 'tiene_permiso' );

		register_rest_route(
			'skynet/v1',
			'/formularios',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'listar_formularios' ),
				'permission_callback' => $permiso,
			)
		);

		register_rest_route(
			'skynet/v1',
			'/radicados',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'listar_radicados' ),
				'permission_callback' => $permiso,
			)
		);

		register_rest_route(
			'skynet/v1',
			'/radicados/exportar',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'exportar_radicados' ),
				'permission_callback' => $permiso,
			)
		);

		register_rest_route(
			'skynet/v1',
			'/radicados/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'obtener_radicado' ),
					'permission_callback' => $permiso,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'eliminar_radicado' ),
					'permission_callback' => $permiso,
				),
			)
		);

		register_rest_route(
			'skynet/v1',
			'/radicados/(?P<id>\d+)/respuesta',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'crear_respuesta' ),
				'permission_callback' => $permiso,
			)
		);

		register_rest_route(
			'skynet/v1',
			'/radicados/(?P<id>\d+)/estado',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'cambiar_estado' ),
				'permission_callback' => $permiso,
				'args'                => array(
					'estado' => array(
						'required' => true,
						'type'     => 'string',
						'enum'     => self::ESTADOS,
					),
				),
			)
		);
	}

	public static function tiene_permiso() {
		return current_user_can( 'manage_options' );
	}

	private static function disponible() {
		if ( ! class_exists( 'Terminal_Forms_DB' ) ) {
			return new WP_Error( 'skynet_sin_formularios', 'El módulo de formularios del tema no está disponible', array( 'status' => 503 ) );
		}
		return true;
	}

	public static function listar_formularios() {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		global $wpdb;
		$t_forms = Terminal_Forms_DB::table_forms();
		$t_subs  = Terminal_Forms_DB::table_submissions();

		$filas = $wpdb->get_results(
			"SELECT f.id, f.title, f.status,
				COUNT(s.id) AS total,
				SUM(CASE WHEN s.status = 'unread' THEN 1 ELSE 0 END) AS sin_leer
			 FROM {$t_forms} f
			 LEFT JOIN {$t_subs} s ON s.form_id = f.id
			 GROUP BY f.id, f.title, f.status
			 ORDER BY f.id ASC"
		);

		$formularios = array();
		foreach ( (array) $filas as $f ) {
			$formularios[] = array(
				'id'       => (int) $f->id,
				'titulo'   => $f->title,
				'estado'   => $f->status,
				'total'    => (int) $f->total,
				'sin_leer' => (int) $f->sin_leer,
			);
		}
		return array( 'formularios' => $formularios );
	}

	/**
	 * Del conjunto de respuestas de un radicado saca los datos que el listado
	 * necesita. Los formularios los arma el usuario desde el editor, así que no
	 * hay claves fijas: se reconocen por la etiqueta del campo.
	 */
	private static function resumen_de_valores( $valores ) {
		$resumen  = array(
			'tipo'        => '',
			'asunto'      => '',
			'solicitante' => '',
			'correo'      => '',
		);
		$patrones = array(
			'tipo'        => '/tipo/iu',
			'asunto'      => '/asunto/iu',
			'solicitante' => '/nombre/iu',
			'correo'      => '/correo|e-?mail/iu',
		);
		foreach ( (array) $valores as $v ) {
			foreach ( $patrones as $clave => $patron ) {
				if ( '' === $resumen[ $clave ] && preg_match( $patron, $v->field_label ) ) {
					$resumen[ $clave ] = (string) $v->field_value;
				}
			}
		}
		return $resumen;
	}

	public static function listar_radicados( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		global $wpdb;
		$t_subs  = Terminal_Forms_DB::table_submissions();
		$t_forms = Terminal_Forms_DB::table_forms();
		$t_vals  = Terminal_Forms_DB::table_values();

		$pagina  = max( 1, (int) $req->get_param( 'page' ) );
		$por_pag = min( 100, max( 1, (int) ( $req->get_param( 'per_page' ) ?: 20 ) ) );
		$form_id = (int) $req->get_param( 'form_id' );
		$estado  = (string) $req->get_param( 'estado' );
		$buscar  = trim( (string) $req->get_param( 'buscar' ) );

		$where  = array( '1=1' );
		$params = array();
		if ( $form_id > 0 ) {
			$where[]  = 's.form_id = %d';
			$params[] = $form_id;
		}
		if ( in_array( $estado, self::ESTADOS, true ) ) {
			$where[]  = 's.status = %s';
			$params[] = $estado;
		}
		if ( '' !== $buscar ) {
			$like     = '%' . $wpdb->esc_like( $buscar ) . '%';
			$where[]  = "(s.tracking_code LIKE %s OR EXISTS (SELECT 1 FROM {$t_vals} v WHERE v.submission_id = s.id AND v.field_value LIKE %s))";
			$params[] = $like;
			$params[] = $like;
		}
		$where_sql = implode( ' AND ', $where );

		$sql_total = "SELECT COUNT(*) FROM {$t_subs} s WHERE {$where_sql}";
		$total     = (int) ( $params ? $wpdb->get_var( $wpdb->prepare( $sql_total, $params ) ) : $wpdb->get_var( $sql_total ) );

		$sql   = "SELECT s.*, f.title AS form_title
			FROM {$t_subs} s
			LEFT JOIN {$t_forms} f ON f.id = s.form_id
			WHERE {$where_sql}
			ORDER BY s.id DESC
			LIMIT %d OFFSET %d";
		$args  = array_merge( $params, array( $por_pag, ( $pagina - 1 ) * $por_pag ) );
		$filas = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

		$valores_por_envio = array();
		if ( $filas ) {
			$ids = implode( ',', array_map( 'intval', wp_list_pluck( $filas, 'id' ) ) );
			foreach ( (array) $wpdb->get_results( "SELECT submission_id, field_label, field_value FROM {$t_vals} WHERE submission_id IN ({$ids}) ORDER BY id ASC" ) as $v ) {
				$valores_por_envio[ $v->submission_id ][] = $v;
			}
		}

		$items = array();
		foreach ( (array) $filas as $s ) {
			$items[] = array(
				'id'         => (int) $s->id,
				'radicado'   => $s->tracking_code,
				'formulario' => array(
					'id'     => (int) $s->form_id,
					'titulo' => $s->form_title,
				),
				'estado'     => $s->status,
				'fecha'      => $s->created_at,
				'resumen'    => self::resumen_de_valores( $valores_por_envio[ $s->id ] ?? array() ),
			);
		}

		return array(
			'items'        => $items,
			'total'        => $total,
			'totalPaginas' => (int) ceil( $total / $por_pag ),
		);
	}

	public static function obtener_radicado( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$s = Terminal_Forms_DB::get_submission( (int) $req['id'] );
		if ( ! $s ) {
			return new WP_Error( 'skynet_no_existe', 'El radicado no existe', array( 'status' => 404 ) );
		}

		$campos = array();
		foreach ( (array) $s->values as $v ) {
			$campos[] = array(
				'clave'    => $v->field_key,
				'etiqueta' => $v->field_label,
				'valor'    => (string) $v->field_value,
			);
		}

		global $wpdb;
		$tabla      = self::tabla_respuestas();
		$respuestas = array();
		$filas      = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$tabla} WHERE submission_id = %d ORDER BY id ASC", $s->id ) );
		foreach ( (array) $filas as $r ) {
			$respuestas[] = array(
				'id'            => (int) $r->id,
				'nota'          => (string) $r->nota,
				'archivoUrl'    => (string) $r->archivo_url,
				'archivoNombre' => (string) $r->archivo_nombre,
				'autor'         => (string) $r->autor,
				'fecha'         => $r->created_at,
			);
		}

		return array(
			'id'         => (int) $s->id,
			'radicado'   => $s->tracking_code,
			'formulario' => array(
				'id'     => (int) $s->form_id,
				'titulo' => $s->form_title,
			),
			'estado'     => $s->status,
			'fecha'      => $s->created_at,
			'ip'         => $s->user_ip,
			'navegador'  => $s->user_agent,
			'campos'     => $campos,
			'respuestas' => $respuestas,
			'resumen'    => self::resumen_de_valores( $s->values ),
		);
	}

	/**
	 * Todos los radicados con todas sus respuestas, para exportar. Tope de
	 * 5000 por llamada: es una bandeja institucional, no un volcado masivo.
	 */
	public static function exportar_radicados( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$estado = (string) $req->get_param( 'estado' );
		$envios = Terminal_Forms_DB::get_submissions_with_values(
			array(
				'form_id' => (int) $req->get_param( 'form_id' ),
				'status'  => in_array( $estado, self::ESTADOS, true ) ? $estado : '',
				'limit'   => 5000,
				'offset'  => 0,
			)
		);

		$items = array();
		foreach ( (array) $envios as $s ) {
			$campos = array();
			foreach ( (array) $s->values as $v ) {
				$campos[] = array(
					'etiqueta' => $v->field_label,
					'valor'    => (string) $v->field_value,
				);
			}
			$items[] = array(
				'radicado'   => $s->tracking_code,
				'formulario' => $s->form_title,
				'estado'     => $s->status,
				'fecha'      => $s->created_at,
				'ip'         => $s->user_ip,
				'campos'     => $campos,
			);
		}
		return array( 'items' => $items );
	}

	/**
	 * Borra el radicado, sus respuestas del ciudadano y las del Terminal
	 * (igual que el botón × de la bandeja de WordPress) y los PDF de respuesta.
	 * El adjunto que subió el ciudadano lo guarda el tema y no se toca.
	 */
	public static function eliminar_radicado( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$id = (int) $req['id'];
		if ( ! Terminal_Forms_DB::get_submission( $id ) ) {
			return new WP_Error( 'skynet_no_existe', 'El radicado no existe', array( 'status' => 404 ) );
		}
		Terminal_Forms_DB::delete_submission( $id );
		global $wpdb;
		$tabla = self::tabla_respuestas();
		// El PDF de respuesta es del Terminal: se borra del disco junto con el
		// radicado (solo si su ruta está dentro de uploads/).
		$base = wp_normalize_path( wp_upload_dir()['basedir'] );
		foreach ( (array) $wpdb->get_col( $wpdb->prepare( "SELECT archivo_ruta FROM {$tabla} WHERE submission_id = %d AND archivo_ruta <> ''", $id ) ) as $ruta ) {
			if ( 0 === strpos( wp_normalize_path( $ruta ), $base . '/' ) ) {
				wp_delete_file( $ruta );
			}
		}
		$wpdb->delete( $tabla, array( 'submission_id' => $id ) );
		return array( 'id' => $id );
	}

	/**
	 * Guarda el PDF en la mediateca con un prefijo aleatorio: la URL no se
	 * puede adivinar, solo la ve quien consulta el radicado.
	 */
	private static function guardar_pdf( $archivo ) {
		if ( ! empty( $archivo['error'] ) ) {
			return new WP_Error( 'skynet_archivo', 'No se pudo recibir el archivo', array( 'status' => 400 ) );
		}
		if ( $archivo['size'] > self::MAX_PDF ) {
			return new WP_Error( 'skynet_archivo', 'El PDF supera el máximo de 10 MB', array( 'status' => 400 ) );
		}
		$tipo = wp_check_filetype_and_ext( $archivo['tmp_name'], $archivo['name'], array( 'pdf' => 'application/pdf' ) );
		if ( empty( $tipo['ext'] ) || 'pdf' !== $tipo['ext'] ) {
			return new WP_Error( 'skynet_archivo', 'Solo se aceptan archivos PDF', array( 'status' => 400 ) );
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';
		$resultado = wp_handle_upload(
			$archivo,
			array(
				'test_form'                => false,
				'mimes'                    => array( 'pdf' => 'application/pdf' ),
				'unique_filename_callback' => function ( $dir, $nombre, $ext ) {
					return bin2hex( random_bytes( 12 ) ) . '-' . sanitize_file_name( pathinfo( $nombre, PATHINFO_FILENAME ) ) . $ext;
				},
			)
		);
		if ( ! empty( $resultado['error'] ) ) {
			return new WP_Error( 'skynet_archivo', 'No se pudo guardar el PDF', array( 'status' => 500 ) );
		}
		return array(
			'url'    => $resultado['url'],
			'ruta'   => $resultado['file'],
			'nombre' => sanitize_file_name( $archivo['name'] ),
		);
	}

	public static function crear_respuesta( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		self::instalar_si_hace_falta();
		$id = (int) $req['id'];
		if ( ! Terminal_Forms_DB::get_submission( $id ) ) {
			return new WP_Error( 'skynet_no_existe', 'El radicado no existe', array( 'status' => 404 ) );
		}

		$nota = trim( sanitize_textarea_field( (string) $req->get_param( 'nota' ) ) );
		if ( mb_strlen( $nota ) > self::MAX_NOTA ) {
			return new WP_Error( 'skynet_nota', 'La nota supera los 3000 caracteres', array( 'status' => 400 ) );
		}

		$url    = '';
		$nombre = '';
		$ruta   = '';
		$files  = $req->get_file_params();
		if ( ! empty( $files['archivo'] ) && UPLOAD_ERR_NO_FILE !== (int) $files['archivo']['error'] ) {
			$pdf = self::guardar_pdf( $files['archivo'] );
			if ( is_wp_error( $pdf ) ) {
				return $pdf;
			}
			$url    = $pdf['url'];
			$nombre = $pdf['nombre'];
			$ruta   = $pdf['ruta'];
		}

		if ( '' === $nota && '' === $url ) {
			return new WP_Error( 'skynet_vacia', 'Escribe una nota o adjunta un PDF', array( 'status' => 400 ) );
		}

		global $wpdb;
		$wpdb->insert(
			self::tabla_respuestas(),
			array(
				'submission_id'  => $id,
				'nota'           => $nota,
				'archivo_url'    => $url,
				'archivo_nombre' => $nombre,
				'archivo_ruta'   => $ruta,
				'autor'          => mb_substr( sanitize_text_field( (string) $req->get_param( 'autor' ) ), 0, 100 ),
				'created_at'     => current_time( 'mysql' ),
			)
		);
		return array(
			'id'            => (int) $wpdb->insert_id,
			'nota'          => $nota,
			'archivoUrl'    => $url,
			'archivoNombre' => $nombre,
		);
	}

	/**
	 * Lo que ve el ciudadano al consultar su radicado: nota y PDF, sin el
	 * nombre de quien respondió.
	 */
	public static function ajax_respuesta_publica() {
		$vacio  = array( 'respuestas' => array() );
		$pedir  = array(
			'respuestas'     => array(),
			'requiereCorreo' => true,
		);
		// Los radicados son consecutivos: sin tope, un script los recorre todos.
		// 10 consultas por minuto y por IP alcanzan de sobra para una persona.
		$ip     = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$clave  = 'skynet_rl_' . md5( $ip );
		$cuenta = (int) get_transient( $clave );
		if ( $cuenta >= 10 ) {
			wp_send_json_success( $vacio );
		}
		set_transient( $clave, $cuenta + 1, MINUTE_IN_SECONDS );
		$codigo = isset( $_POST['tracking_code'] ) ? sanitize_text_field( wp_unslash( $_POST['tracking_code'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		if ( ! preg_match( '/^[A-Za-z0-9-]{3,50}$/', $codigo ) || ! class_exists( 'Terminal_Forms_DB' ) ) {
			wp_send_json_success( $vacio );
		}
		$s = Terminal_Forms_DB::get_submission_by_tracking( $codigo );
		if ( ! $s ) {
			wp_send_json_success( $vacio );
		}
		global $wpdb;
		$tabla  = self::tabla_respuestas();
		$filas  = $wpdb->get_results( $wpdb->prepare( "SELECT nota, archivo_url, archivo_nombre, created_at FROM {$tabla} WHERE submission_id = %d ORDER BY id ASC", $s->id ) );
		if ( ! $filas ) {
			wp_send_json_success( $vacio );
		}

		// El radicado es consecutivo y fácil de adivinar: la respuesta (que puede
		// traer datos del caso) solo se entrega a quien también conoce el correo
		// con el que se radicó.
		$correo = isset( $_POST['correo'] ) ? sanitize_email( wp_unslash( $_POST['correo'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		if ( '' === $correo ) {
			wp_send_json_success( $pedir );
		}
		$fallos_clave = 'skynet_cf_' . md5( $ip . '|' . $codigo );
		$fallos       = (int) get_transient( $fallos_clave );
		if ( $fallos >= 5 ) {
			wp_send_json_success( array_merge( $pedir, array( 'bloqueado' => true ) ) );
		}
		$completo = Terminal_Forms_DB::get_submission( (int) $s->id );
		$resumen  = self::resumen_de_valores( $completo ? $completo->values : array() );
		$esperado = strtolower( trim( $resumen['correo'] ) );
		if ( '' === $esperado || ! hash_equals( $esperado, strtolower( $correo ) ) ) {
			set_transient( $fallos_clave, $fallos + 1, 15 * MINUTE_IN_SECONDS );
			wp_send_json_success( array_merge( $pedir, array( 'correoInvalido' => true ) ) );
		}

		$salida = array();
		foreach ( (array) $filas as $r ) {
			$salida[] = array(
				'nota'          => (string) $r->nota,
				'archivoUrl'    => (string) $r->archivo_url,
				'archivoNombre' => (string) $r->archivo_nombre,
				'fecha'         => $r->created_at,
			);
		}
		wp_send_json_success( array( 'respuestas' => $salida ) );
	}

	/**
	 * Script que completa el resultado de la consulta de radicado del tema
	 * (forms.js) con la respuesta del Terminal. No toca el tema: observa el
	 * resultado que el tema pinta y le agrega un bloque debajo.
	 */
	public static function encolar_script_publico() {
		wp_register_script( 'skynet-bridge-front', false, array(), self::VERSION, true );
		wp_enqueue_script( 'skynet-bridge-front' );
		$ajax = esc_url_raw( admin_url( 'admin-ajax.php' ) );
		$js   = <<<'JS'
(function () {
  if (!document.querySelector('.terminal-tracking-search-form')) return;
  var AJAX = __AJAX__;
  var estilo = document.createElement('style');
  estilo.textContent = '.skynet-respuesta{display:block;margin-top:14px}.skynet-respuesta p{margin:6px 0 0;white-space:pre-wrap;word-break:break-word}.skynet-respuesta a{display:inline-block;margin-top:8px;font-weight:600}.skynet-respuesta small{opacity:.7}';
  document.head.appendChild(estilo);

  function fecha(v) {
    var d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function quitarFormulario(raiz) {
    var viejo = raiz.querySelector('.skynet-correo');
    if (viejo) viejo.remove();
  }

  // El número de radicado es consecutivo: la respuesta solo se muestra a quien
  // también escribe el correo con el que radicó.
  function pedirCorreo(codeEl, raiz, datos) {
    quitarFormulario(raiz);
    var caja = document.createElement('div');
    caja.className = 'tf-status-banner skynet-respuesta skynet-correo';
    var titulo = document.createElement('strong');
    titulo.textContent = 'Este radicado tiene una respuesta del Terminal';
    caja.appendChild(titulo);
    var texto = document.createElement('p');
    texto.textContent = datos.bloqueado
      ? 'Demasiados intentos con un correo que no coincide. Espera unos minutos e inténtalo de nuevo.'
      : datos.correoInvalido
        ? 'Ese correo no coincide con el del radicado. Revísalo e inténtalo de nuevo.'
        : 'Escribe el correo electrónico con el que radicaste tu solicitud para verla.';
    caja.appendChild(texto);
    if (!datos.bloqueado) {
      var form = document.createElement('form');
      form.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
      var campo = document.createElement('input');
      campo.type = 'email';
      campo.required = true;
      campo.autocomplete = 'email';
      campo.placeholder = 'correo@ejemplo.com';
      campo.setAttribute('aria-label', 'Correo electrónico del radicado');
      campo.style.cssText = 'flex:1 1 220px;min-width:0;padding:8px 10px';
      var boton = document.createElement('button');
      boton.type = 'submit';
      boton.textContent = 'Ver respuesta';
      boton.style.cssText = 'padding:8px 14px;font-weight:600;cursor:pointer';
      form.appendChild(campo);
      form.appendChild(boton);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        boton.disabled = true;
        consultar(codeEl, raiz, campo.value.trim());
      });
      caja.appendChild(form);
    }
    raiz.appendChild(caja);
  }

  function consultar(codeEl, raiz, correo) {
    var cuerpo = new FormData();
    cuerpo.append('action', 'skynet_respuesta_publica');
    cuerpo.append('tracking_code', codeEl.textContent.trim());
    if (correo) cuerpo.append('correo', correo);
    fetch(AJAX, { method: 'POST', body: cuerpo, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var datos = res && res.success && res.data;
        if (!datos) return;
        if (datos.requiereCorreo) {
          pedirCorreo(codeEl, raiz, datos);
          return;
        }
        var lista = datos.respuestas;
        if (!lista || !lista.length) return;
        quitarFormulario(raiz);
        lista.forEach(function (r) {
          var caja = document.createElement('div');
          caja.className = 'tf-status-banner skynet-respuesta';
          var titulo = document.createElement('strong');
          titulo.textContent = 'Respuesta del Terminal';
          caja.appendChild(titulo);
          var cuando = fecha(r.fecha);
          if (cuando) {
            var f = document.createElement('small');
            f.textContent = ' · ' + cuando;
            caja.appendChild(f);
          }
          if (r.nota) {
            var p = document.createElement('p');
            p.textContent = r.nota;
            caja.appendChild(p);
          }
          if (/^https?:\/\//i.test(r.archivoUrl)) {
            var a = document.createElement('a');
            a.href = r.archivoUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Descargar documento (PDF)' + (r.archivoNombre ? ' - ' + r.archivoNombre : '');
            caja.appendChild(document.createElement('br'));
            caja.appendChild(a);
          }
          raiz.appendChild(caja);
        });
      })
      .catch(function () {});
  }

  function pintar(codeEl) {
    if (codeEl.getAttribute('data-skynet')) return;
    codeEl.setAttribute('data-skynet', '1');
    consultar(codeEl, codeEl.closest('[class*="tf-track-status"]') || codeEl.parentNode, '');
  }

  new MutationObserver(function () {
    document.querySelectorAll('.tf-result-code-val').forEach(pintar);
  }).observe(document.body, { childList: true, subtree: true });
})();
JS;
		wp_add_inline_script( 'skynet-bridge-front', str_replace( '__AJAX__', wp_json_encode( $ajax ), $js ) );
	}

	public static function cambiar_estado( WP_REST_Request $req ) {
		$ok = self::disponible();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$id     = (int) $req['id'];
		$estado = (string) $req->get_param( 'estado' );

		if ( ! in_array( $estado, self::ESTADOS, true ) ) {
			return new WP_Error( 'skynet_estado_invalido', 'Estado no válido', array( 'status' => 400 ) );
		}
		if ( ! Terminal_Forms_DB::get_submission( $id ) ) {
			return new WP_Error( 'skynet_no_existe', 'El radicado no existe', array( 'status' => 404 ) );
		}

		// `solo_si_sin_leer`: marcar "leído" al abrir un radicado nunca debe
		// bajar uno que otra persona ya tramitó mientras la pantalla seguía
		// abierta.
		$actual = Terminal_Forms_DB::get_submission( $id );
		if ( $req->get_param( 'solo_si_sin_leer' ) && 'unread' !== $actual->status ) {
			return array(
				'id'     => $id,
				'estado' => $actual->status,
			);
		}

		Terminal_Forms_DB::update_submission_status( $id, $estado );
		return array(
			'id'     => $id,
			'estado' => $estado,
		);
	}
}

Skynet_Bridge::init();
