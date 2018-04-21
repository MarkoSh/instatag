const	request 		= 	require( 'request' ),
		async			= 	require( 'async' ),
		EventEmitter	= 	require( 'events' ),
		fs				= 	require( 'fs' ),
		jsdom			= 	require( 'jsdom' ),
		datetime		=	require( 'node-datetime' ),
		{ JSDOM }		=	jsdom,
		mysql			= 	require( 'mysql' ),
		pool			= 	mysql.createPool( {
								host		: 'localhost',
								user		: 'root',
								database	: 'instatags'
							} ),
		dbs				=	[ 'db.txt', 'db_fitness.txt' ],

		
		BASE_SITE_URL	=	'https://www.instagram.com/';
var		tags			=	{};

class Emitter extends EventEmitter {};

const emitter = new Emitter();

emitter.on( 'start', () => {
	pool.query( 'truncate table tags', ( error, result ) => {
		if ( ! error ) {
			async.eachOfLimit( dbs, 2, ( db, key, callback ) => {
				emitter.emit( 'read_db', db, callback );
			}, () => {
				console.log( 'All done.' );
				process.exit();
			} );
		} else {
			console.error( 'Error: ' + error );
			process.exit();
		}
	} );
	
	
} );

emitter.on( 'read_db', ( db, callback ) => {
	fs.readFile( db, ( error, data ) => {
		var lines = data.toString().split( "\n" );
		async.eachOfLimit( lines, 5, ( line, key, callback_ ) => {
			emitter.emit( 'request_line', db, line, callback_ );
		}, () => {
			tags = Object.values( tags );
			tags = tags.map( ( current, index, array ) => {
				return Object.values( current );
			} );
			var sql = "INSERT INTO tags(type, comments, likes, user, followers, tag, image, date, imagedate) VALUES ? ON DUPLICATE KEY UPDATE tag = tag";

			pool.query( sql, [ tags ], ( error, result ) => {
				if ( ! error ) {
					console.log( 'Insert done.' );
				} else {
					console.error( 'Error: ' + error );
				}
				callback();
			} );
		} );
	} );
} );

emitter.on( 'request_line', ( db, line, callback ) => {
	console.log( 'Getting ' + line + '...' );
	request( {
		url : BASE_SITE_URL + line
	}, ( error, response, body ) => {
		if ( ! error ) {
			console.log( 'Getting ' + line + '...got' );
			const { window }	= new JSDOM( body, {
				runScripts: 'dangerously'
			} );
			try {
				if ( window._sharedData.entry_data.ProfilePage.length > 0 ) {
					var user 				= window._sharedData.entry_data.ProfilePage[ 0 ].graphql.user,
					edge_follow 			= window._sharedData.entry_data.ProfilePage[ 0 ].graphql.user.edge_follow.count,
					edge_followed_by 		= window._sharedData.entry_data.ProfilePage[ 0 ].graphql.user.edge_followed_by.count,
					edges 					= window._sharedData.entry_data.ProfilePage[ 0 ].graphql.user.edge_owner_to_timeline_media.edges;
					edges.slice( 0, 1 ).forEach( edge => {
						var caption 				= edge.node.edge_media_to_caption.edges.length > 0 ? edge.node.edge_media_to_caption.edges[ 0 ].node.text : '';
							edge_liked_by 			= edge.node.edge_liked_by.count,
							edge_media_to_comment	= edge.node.edge_media_to_comment.count,
							tags_list 				= caption.match( /\#([a-zA-Z0-9]+)/g );
						
						try {
							if ( tags_list.length > 0 ) {
								tags_list.forEach( tag => {
									tags[ tag ] = {
										type		:	db,
										comments	:	edge_media_to_comment,
										likes		:	edge_liked_by,
										user		:	user.username,
										followers	:	edge_followed_by,
										tag			: 	tag,
										image		:	edge.node.shortcode,
										date		:	datetime.create().format( 'Y-m-d H:M:S' ),
										imagedate	:	datetime.create( new Date( edge.node.taken_at_timestamp * 1000 ) ).format( 'Y-m-d H:M:S' )
									};
								} );
							}
						} catch ( error ) {
							console.error( 'Error: ' + error );
						}
					} );
				}
			} catch ( e ) {
				console.error( 'Error: ' + error );
			}
		} else {
			console.error( 'Error: ' + error );
		}
		callback();
	} );
} );

emitter.emit( 'start' );