/*
	Time Machine - Pushstate history and ajax helper
	@andygrn 2018
*/

( () => {

	'use strict';

	window.TimeMachine = function( inputs ) {

		const debug = inputs.debug ? true : false;

		if ( !( window.history && window.history.pushState ) ) {
			debugLog( 'History API is unsupported - Time Machine disabled' );
			return;
		}

		if ( !inputs.default_ajax_receptacle_id ) {
			debugLog( 'No default ajax receptacle specified - Time Machine disabled', 'warn' );
			return;
		}

		if ( !inputs.beforeNewPageLoad ) {
			debugLog( 'No beforeNewPageLoad callback - Time Machine disabled', 'warn' );
			return;
		}

		const host_regex = new RegExp( '^' + window.location.protocol + '//' + window.location.host, 'i' );
		const default_ajax_receptacle = document.getElementById( inputs.default_ajax_receptacle_id );
		const title_element = document.querySelector( 'title' );
		let last_load_url = null;

		window.history.replaceState( { receptacle: inputs.default_ajax_receptacle_id }, null, null );

		window.addEventListener( 'popstate', handleStateChange );
		window.addEventListener( 'click', handlePotentialTriggerClick );

		debugLog( 'Ready' );
		debugLog( '------' );

		function debugLog( message, type ) {
			if ( !debug || !console ) {
				return;
			}
			message = 'Time Machine: ' + message;
			if ( console[type || 'log'] ) {
				console[type || 'log']( message );
			}
		}

		function pushStateChange( url, receptacle_id ) {
			debugLog( 'Pushing new state "' + url + '" into receptacle "' + receptacle_id + '"' );
			window.history.pushState( { receptacle: receptacle_id }, null, url );
			performStateChangeTasks( receptacle_id );
		}

		function handleStateChange( event ) {
			debugLog( 'State change detected' );
			performStateChangeTasks( event.state.receptacle );
		}

		function handlePotentialTriggerClick( event ) {
			let target = event.target;
			while ( target !== null ) {
				if ( target.hasAttribute( 'href' ) ) {
					const path = target.href.replace( host_regex, '' );
					if ( path[0] !== '/' ) {
						return;
					}
					event.preventDefault();
					const link_receptacle_id = target.getAttribute( 'data-tm-receptacle' );
					pushStateChange(
						target.href,
						( link_receptacle_id === null ? inputs.default_ajax_receptacle_id : link_receptacle_id )
					);
					return;
				}
				target = target.parentElement;
			}
		}

		function performStateChangeTasks( receptacle_id ) {
			debugLog( 'Running "beforeNewPageLoad" callback' );
			inputs.beforeNewPageLoad( receptacle_id, ( custom_headers ) => {
				loadUrlIntoReceptacle( window.location.href, receptacle_id, custom_headers );
			} );
		}

		function onLoadSuccess( data, receptacle_id ) {
			debugLog( 'Page data retrieved' );
			const frag = document.createElement( 'div' );
			let receptacle_element = document.getElementById( receptacle_id );
			if ( receptacle_element === null ) {
				debugLog( 'Receptacle #' + receptacle_id + ' not found in current page, loading into default receptacle' );
				receptacle_id = inputs.default_ajax_receptacle_id;
				receptacle_element = default_ajax_receptacle;
			}
			frag.innerHTML = data;
			receptacle_element.innerHTML = frag.querySelector( '#' + receptacle_id ).innerHTML;
			const metadata_element = receptacle_element.firstElementChild;
			const title = metadata_element.getAttribute( 'data-tm-title' );
			if ( title !== null ) {
				setTitle( title );
			}
			runPageScripts( receptacle_element );
			if ( inputs.afterNewPageLoad ) {
				debugLog( 'Running "afterNewPageLoad" callback' );
				let page_data_parsed = null;
				const page_data = metadata_element.getAttribute( 'data-tm-data' );
				if ( page_data !== null ) {
					try {
						page_data_parsed = JSON.parse( page_data );
					} catch ( e ) {
						debugLog( 'Malformed JSON in page data attribute, ignoring', 'warn' );
					}
				}
				inputs.afterNewPageLoad( receptacle_id, page_data_parsed );
			}
			debugLog( 'Done' );
			debugLog( '------' );
		}

		function onLoadFail() {
			debugLog( 'Page failed to load, turning back time...', 'warn' );
			window.history.back();
			debugLog( '------' );
		}

		function runPageScripts( receptacle_element ) {
			debugLog( 'Running page scripts' );
			const page_scripts = receptacle_element.querySelectorAll( 'script' );
			for ( let i = 0; i < page_scripts.length; i += 1 ) {
				( new Function( page_scripts[i].innerHTML ) ).call( window );
			}
		}

		function setTitle( title ) {
			title = ( typeof title === 'undefined' ? '' : title );
			debugLog( 'Setting page title to "' + title + '"' );
			title_element.innerHTML = title;
		}

		function loadUrlIntoReceptacle( url, receptacle_id, headers ) {
			if ( !url ) {
				return;
			}
			debugLog( 'Requesting new page "' + url + '"' );
			last_load_url = url;
			headers = headers || [];
			const xmlhr = new XMLHttpRequest();
			let request_completed = false;
			xmlhr.open( 'GET', url, true );
			xmlhr.setRequestHeader( 'X-Requested-With', 'XMLHttpRequest' );
			for ( let i = 0; i < headers.length; i += 1 ) {
				xmlhr.setRequestHeader( headers[i][0], headers[i][1] );
			}
			xmlhr.addEventListener( 'readystatechange', () => {
				if ( xmlhr.readyState === 4 && !request_completed ) {
					if ( ( xmlhr.status >= 200 && xmlhr.status < 300 ) || xmlhr.status === 304 ) {
						if ( url !== last_load_url ) {
							debugLog( 'Skipping load, new load started after this one' );
							return;
						}
						onLoadSuccess( xmlhr.response, receptacle_id );
					} else {
						onLoadFail();
					}
					request_completed = true;
				}
			}, false );
			setTimeout( () => {
				if ( request_completed ) {
					return;
				}
				request_completed = true;
				onLoadFail();
			}, 8000 );
			xmlhr.send( null );
		}

		return {
			pushStateChange: pushStateChange
		};

	};

} )();