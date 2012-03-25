; ( function ( foresight, window, document ) {
	"use strict";

	// properties
	foresight.devicePixelRatio = ( ( window.devicePixelRatio && window.devicePixelRatio > 1 ) ? window.devicePixelRatio : 1 );
	foresight.isHighSpeedConn = false;
	foresight.hiResEnabled = false;
	foresight.connKbps = 0;
	foresight.connTestMethod = undefined;
	foresight.images = [];

	// options
	foresight.options = foresight.options || {};
	var opts = foresight.options,
	srcModification = opts.srcModification || 'replaceDimensions',
	srcFormat = opts.srcFormat || '{protocol}://{host}{directory}{file}',
	testConn = opts.testConn || true,
	minKbpsForHighSpeedConn = opts.minKbpsForHighSpeedConn || 800,
	speedTestUri = opts.speedTestUri || 'http://foresightjs.appspot.com/speed-test/100K.jpg',
	speedTestKB = opts.speedTestKB || 100,
	speedTestExpireMinutes = opts.speedTestExpireMinutes || 30,
	maxBrowserWidth = opts.maxBrowserWidth || 1024,
	maxBrowserHeight = opts.maxBrowserHeight || maxBrowserWidth,
	maxRequestWidth = opts.maxRequestWidth || 2048,
	maxRequestHeight = opts.maxRequestHeight || maxRequestWidth,
	forcedPixelRatio = opts.forcedPixelRatio,

	imageIterateStatus,
	speedConnectionStatus,

	 //for minification purposes
	STATUS_LOADING = 'loading',
	STATUS_COMPLETE = 'complete',
	LOCAL_STORAGE_KEY = 'fsjs',
	TRUE = true,
	FALSE = false,

	initForesight = function () {
		if ( imageIterateStatus ) return;

		imageIterateStatus = STATUS_LOADING;

		initImages();

		imageIterateStatus = STATUS_COMPLETE;

		initImageRebuild();
	},

	initSpeedTest = function () {
		// only check the connection speed once, if there is a status we already got info or it already started
		if ( speedConnectionStatus ) return;

		// if the device pixel ratio is 1, then no need to do a speed test
		if ( foresight.devicePixelRatio === 1 ) {
			foresight.connTestMethod = 'skip';
			speedConnectionStatus = STATUS_COMPLETE;
			return;
		}

		// check if a speed test has recently been completed and data saved in the local storage
		// localStorage.removeItem( LOCAL_STORAGE_KEY );
		try {
			var fsData = JSON.parse( localStorage.getItem( LOCAL_STORAGE_KEY ) );
			if ( fsData && fsData.isHighSpeedConn ) {
				var minuteDifference = ( ( new Date() ).getTime() - fsData.timestamp ) / 1000 / 60;
				if ( minuteDifference < speedTestExpireMinutes ) {
					// already have connection data without our desired timeframe, use this instead of another test
					foresight.isHighSpeedConn = TRUE;
					foresight.connKbps = fsData.connKbps;
					foresight.connTestMethod = 'localStorage';
					speedConnectionStatus = STATUS_COMPLETE;
					return;
				}
			}
		} catch( e ) { }

		var 
		speedTestImg = document.createElement( 'img' ),
		endTime,
		startTime,
		speedTestTimeoutMS;

		speedTestImg.onload = function () {
			// speed test image download completed
			endTime = ( new Date() ).getTime();

			var duration = round( ( endTime - startTime ) / 1000 );
			duration = ( duration > 1 ? duration : 1 );

			var bitsLoaded = ( speedTestKB * 1024 * 8 );
			foresight.connKbps = ( round( bitsLoaded / duration ) / 1024 );
			foresight.isHighSpeedConn = ( foresight.connKbps >= minKbpsForHighSpeedConn );

			speedTestComplete( 'networkSuccess' );
		};

		speedTestImg.onerror = function () {
			// fallback incase there was an error downloading the speed test image
			speedTestComplete( 'networkError' );
		};

		// begin the network connection speed test image download
		startTime = ( new Date() ).getTime();
		speedConnectionStatus = STATUS_LOADING;
		if ( document.location.protocol === 'https:' ) {
			speedTestUri = speedTestUri.replace( 'http:', 'https:' );
		}
		speedTestImg.src = speedTestUri + "?r=" + Math.random();

		// calculate the maximum number of milliseconds it 'should' take to download an XX Kbps file
		// set a timeout so that if the speed testdownload takes too long (plus 250ms for benefit of the doubt)
		// than it isn't a high speed connection and ignore what the test image .onload has to say
		speedTestTimeoutMS = ( ( ( speedTestKB * 8 ) / minKbpsForHighSpeedConn ) * 1000 ) + 250;
		setTimeout( function () {
			speedTestComplete( 'networkSlow' );
		}, speedTestTimeoutMS );
	},

	speedTestComplete = function ( connTestMethod ) {
		// if we haven't already gotten a speed connection status then save the info
		if (speedConnectionStatus === STATUS_COMPLETE) return;

		foresight.connTestMethod = connTestMethod;

		try {
			var fsDataToSet = {
				connKbps: foresight.connKbps,
				isHighSpeedConn: foresight.isHighSpeedConn,
				timestamp: ( new Date() ).getTime()
			};
			localStorage.setItem( LOCAL_STORAGE_KEY, JSON.stringify( fsDataToSet ) );
		} catch( e ) { }

		speedConnectionStatus = STATUS_COMPLETE;
		initImageRebuild();
	},

	initImages = function () {

		var
		x,
		img;
		
		for ( x = 0; x < document.images.length; x ++ ) {
			img = document.images[ x ];
			
			// initialize some properties the image will use
			if ( !img.initalized ) {
				// only gather the images that haven't already been initialized
				img.initalized = TRUE;
				
				fillImgProperty( img, 'src', 'orgSrc' ); // important, do not set the src attribute yet!
		
				 // missing required attributes
				if ( !img.orgSrc || !img.width || !img.height ) continue;
				
				img.browserWidth = img.width;
				img.browserHeight = img.height;
				img.orgWidth = img.width;
				img.orgHeight = img.height;
				img.requestWidth = 0;
				img.requestHeight = 0;
				img.orgClassName = img.className.replace( 'fs-img', 'fs-img-ready' );
	
				// fill in the image's properties from the element's attributes
				fillImgProperty( img, 'max-width', 'maxWidth', TRUE, maxBrowserWidth );
				fillImgProperty( img, 'max-height', 'maxHeight', TRUE, maxBrowserHeight );
	
				fillImgProperty( img, 'max-request-width', 'maxRequestWidth', TRUE, maxRequestWidth );
				fillImgProperty( img, 'max-request-height', 'maxRequestHeight', TRUE, maxRequestHeight );
	
				fillImgProperty( img, 'width-percent', 'widthPercent', TRUE, 0 );
				fillImgProperty( img, 'height-percent', 'heightPercent', TRUE, 0 );
	
				fillImgProperty( img, 'src-modification', 'srcModification', FALSE, srcModification );
				fillImgProperty( img, 'src-format', 'srcFormat', FALSE, srcFormat );
				fillImgProperty( img, 'pixel-ratio', 'pixelRatio', TRUE, foresight.devicePixelRatio );
	
				fillImgProperty( img, 'src-high-resolution', 'highResolution', FALSE );
				
				// set the img's id if there isn't one already
				if ( !img.id ) {
					img.id = 'fsImg' + Math.round( Math.random() * 10000000 );
				}
	
				// add this image to the collection, but do not add it to the DOM yet
				foresight.images.push( img );
			}
		}

	},

	fillImgProperty = function ( img, attrName, propName, getFloat, defaultValue ) {
		// standard function to fill up an <img> with data from the <noscript>
		var value = img.getAttribute( 'data-' + attrName );
		if ( value && value !== '' ) {
			if ( getFloat ) {
				value = value.replace( '%', '' );
				if ( !isNaN( value ) ) {
					value = parseFloat( value, 10 );
				}
			}
		} else {
			value = defaultValue;
		}
		img[ propName ] = value;
	},

	initImageRebuild = function () {
		// if both the speed connection test and we've looped through the entire DOM, then rebuild the image src
		if ( speedConnectionStatus === STATUS_COMPLETE && imageIterateStatus === STATUS_COMPLETE ) {

			if ( foresight.isHighSpeedConn && foresight.devicePixelRatio > 1 ) {
				foresight.hiResEnabled = TRUE;
			}

			var
			x,
			img,
			imgRequestWidth,
			imgRequestHeight,
			requestDimensionChange;

			for ( x = 0; x < foresight.images.length; x++ ) {
				img = foresight.images[ x ];

				// decide if this image should be hi-res
				img.hiResEnabled = ( foresight.isHighSpeedConn && img.pixelRatio > 1 );

				// set the image according to its properties
				if ( img.widthPercent ) {
					if ( !img.parentElement.clientWidth ) continue; // parent not set yet
					var orgW = img.browserWidth; 
					img.browserWidth = round( ( img.widthPercent / 100 ) * img.parentElement.clientWidth );
					img.browserHeight = round( img.browserHeight * ( img.browserWidth / orgW ) );
				} else if ( img.heightPercent ) {
					if ( !img.parentElement.clientHeight ) continue; // parent not set yet
					var orgH = img.browserHeight;
					img.browserHeight = round( ( img.heightPercent / 100 ) * img.parentElement.clientHeight );
					img.browserWidth = round( img.browserWidth * ( img.browserHeight / orgH ) );
				}
			
				// ensure the img dimensions do not exceed the max, scale proportionally
				maxDimensionScaling( img, 'browserWidth', 'maxWidth', 'browserHeight', 'maxHeight' );
			
				if ( !img.browserWidth || !img.browserHeight ) {
					continue; // we're not going to load an image that has no width or height
				}
			
				// build a list of Css Classnames for the <img> which may be useful for designers
				var classNames = ( img.orgClassName ? img.orgClassName.split( ' ' ) : [] );
				classNames.push( ( img.hiResEnabled ? 'fs-high-resolution' : 'fs-standard-resolution' ) );
				classNames.push( 'fs-pixel-ratio-' + img.pixelRatio.toFixed( 1 ).replace('.', '_' ) );
				img.className = classNames.join( ' ' );
				
				if ( img.hiResEnabled ) {
					imgRequestWidth = round( img.browserWidth * img.pixelRatio );
					imgRequestHeight = round( img.browserHeight * img.pixelRatio );
				} else {
					imgRequestWidth = img.browserWidth;
					imgRequestHeight = img.browserHeight;
				}
					
				// only update the request width/height the new dimension is larger than the one already loaded
				requestDimensionChange = FALSE;
				if ( imgRequestWidth > img.requestWidth ) {
					img.requestWidth = imgRequestWidth;
					requestDimensionChange = TRUE;
				}
				if ( imgRequestHeight > img.requestHeight ) {
					img.requestHeight = imgRequestHeight;
					requestDimensionChange = TRUE;
				}

				// decide how the src should be modified for the new image request
				if ( requestDimensionChange ) {

					// ensure the request dimensions do not exceed the max, scale proportionally
					maxDimensionScaling( img, 'requestWidth', 'maxRequestWidth', 'requestHeight', 'maxRequestHeight' );

					if ( img.highResolution && foresight.hiResEnabled ) {
						img.src = img.highResolution;
						img.srcModification = 'hiResSrc';
					} else if ( img.srcModification === 'rebuildSrc' && img.srcFormat ) {
						rebuildSrc( img );
					} else {
						// default: replaceDimensions
						replaceDimensions( img );
					}
				}

				img.width = img.browserWidth;
				img.height = img.browserHeight;
			}

			if ( foresight.updateComplete ) {
				foresight.updateComplete();
			}
		}
	},

	maxDimensionScaling = function ( img, widthProp, maxWidthProp, heightProp, maxHeightProp ) {
		// used to ensure both the width and height do not go over the max allowed
		// this function is reusable for both the img width/height, and the request width/height
		var orgD;
		if ( img[ widthProp ] > img[ maxWidthProp ] ) {
			orgD = img[ widthProp ];
			img[ widthProp ] = img[ maxWidthProp ];
			img[ heightProp ] = round( img[ heightProp ] * ( img[ widthProp ] / orgD ) );
		}
		if ( img[ heightProp ] > img[ maxHeightProp ] ) {
			orgD = img[ heightProp ];
			img[ heightProp ] = img[ maxHeightProp ];
			img[ widthProp ] = round( img[ widthProp ] * ( img[ heightProp ] / orgD ) );
			if ( img[ widthProp ] > img[ maxWidthProp ] ) {
				orgD = img.img[ widthProp ];
				img[ widthProp ] = img[ maxWidthProp ];
				img[ heightProp ] = round( img[ heightProp ] * ( img[ widthProp ] / orgD ) );
			}
		}
	},

	rebuildSrc = function ( img ) {
		// rebuild the <img> src using the supplied format and image data
		var
		f,
		formatReplace = [ 'protocol', 'host', 'port', 'directory', 'file', 'filename', 'ext', 'query', 'requestWidth', 'requestHeight', 'pixelRatio' ],
		newSrc = img.srcFormat;

		img.uri = parseUri( img.orgSrc );
		img.uri.requestWidth = img.requestWidth;
		img.uri.requestHeight = img.requestHeight;
		img.uri.pixelRatio = img.pixelRatio;
		
		for ( f = 0; f < formatReplace.length; f++ ) {
			newSrc = newSrc.replace( '{' + formatReplace[ f ] + '}', img.uri[ formatReplace[ f ] ] );
		}
		img.src = newSrc; // set the new src, begin downloading this image
	},

	// parseUri 1.2.2
	// (c) Steven Levithan <stevenlevithan.com>
	// MIT License
	parseUri = function ( str ) {
		var o = {
			key: [ "source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor" ],
			q: {
				name: "queryKey",
				parser: /(?:^|&)([^&=]*)=?([^&]*)/g
			},
			parser: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
		},
		m = o.parser.exec( str ),
		uri = {},
		i = 14;

		while (i--) uri[o.key[i]] = m[i] || "";

		uri[o.q.name] = {};
		uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
			if ($1) uri[o.q.name][$1] = $2;
		});

		var fileSplt = uri.file.split('.');
		uri.filename = fileSplt[ 0 ];
		uri.ext = ( fileSplt.length > 1 ? fileSplt[ fileSplt.length -1 ] : '' );

		return uri;
	},

	replaceDimensions = function ( img ) {
		// replace image dimensions already in the src with new dimensions
		// set the new src, begin downloading this image
		img.src = img.orgSrc
					.replace( img.orgWidth, img.requestWidth )
					.replace( img.orgHeight, img.requestHeight );
	},

	round = function ( value ) {
		// used just for smaller javascript after minify
		return Math.round( value );
	},

	addWindowResizeEvent = function () {
		// attach an the foresight.reload event that executes when the window resizes
		if ( window.addEventListener ) {
			window.addEventListener( 'resize', foresight.reload, FALSE );
		} else if ( window.attachEvent ) {
			window.attachEvent( 'onresize', foresight.reload );
		}
	},

	reloadTimeoutId,
	executeReload = function () {
		// execute the reload. This is governed by a timeout so it isn't abused by many events
		if ( imageIterateStatus !== STATUS_COMPLETE || speedConnectionStatus !== STATUS_COMPLETE ) return;
		initImages();
		initImageRebuild();
	};

	foresight.reload = function () {
		// if the window resizes or this function is called by external events (like a hashchange)
		// then it should reload foresight. Uses a timeout so it can govern how many times the reload executes
		window.clearTimeout( reloadTimeoutId ); 
		reloadTimeoutId = window.setTimeout( executeReload, 150 ); 
	};

	if ( forcedPixelRatio ) {
		// force a certain pixel ratio in the options
		foresight.devicePixelRatio = forcedPixelRatio;
	}

	// when the DOM is ready begin finding img's and updating their src's
	if ( document.readyState === STATUS_COMPLETE ) {
		initForesight();
	} else {
		if ( document.addEventListener ) {
			document.addEventListener( "DOMContentLoaded", initForesight, FALSE );
			window.addEventListener( "load", initForesight, FALSE );
		} else if ( document.attachEvent ) {
			document.attachEvent( "onreadystatechange", initForesight );
			window.attachEvent( "onload", initForesight );
		}
	};

	// DOM does not need to be ready to begin the network connection speed test
	initSpeedTest();

	// add a listen to the window.resize event
	addWindowResizeEvent();
	
} ( this.foresight = this.foresight || {}, this, document ) );