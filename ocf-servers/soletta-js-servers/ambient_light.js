var device = require( "iotivity-node" )( "server" ),
    illuminanceResource,
    sensorPin,
    notifyObserversTimeoutId,
    resourceTypeName = "oic.r.sensor.illuminance",
    resourceInterfaceName = "/a/illuminance",
    hasUpdate = false,
    noObservers = false,
    rawValue = 0.0,
    lux = 0.0;

// Require the Soletta AIO library
var aio = "";
try {
    aio = require( "soletta/aio" );
} catch ( e ) {
    console.log( "No AIO module: " + e.message );
}

function readSensorData( callback ) {
    if ( aio ) {
        sensorPin.read().then( function( data ) {
            rawValue = data;
            if ( callback ) {
                illuminanceResource.properties = getProperties();
                callback();
            }
        } );
    } else if ( callback ) {
        illuminanceResource.properties = getProperties();
        callback();
    }
}

// Setup ambient light sensor pin.
function setupHardware() {
    if ( !aio ) {
        return;
    }

    aio.open( {
        name: "A3"
    } ).then( function( pin ) {
        sensorPin = pin;
        readSensorData();
    } );
}

// This function construct the payload and returns when
// the GET request received from the client.
function getProperties() {
    var temp = 0;
    if ( aio ) {

        // Conversion to lux
        var inputRange = 1 << 12;

        temp = rawValue * 1023 / inputRange;
        temp = 0.152262 * Math.exp( 0.00782118 * ( temp ) );
    } else {

        // Simulate real sensor behavior. This is
        // useful for testing on desktop without a sensor.
        temp = lux + 0.1;
    }

    var illuminance = Math.round( temp * 100 ) / 100;
    if ( lux != illuminance ) {
        lux = illuminance;
        hasUpdate = true;
    }

    // Format the payload.
    var properties = {
        rt: resourceTypeName,
        id: "illuminance",
        illuminance: lux
    };

    return properties;
}

// Set up the notification loop
function notifyObservers() {
    readSensorData( function() {
        if ( hasUpdate ) {
            hasUpdate = false;
            console.log( "\nIlluminance: Send the response - Illuminance: " + lux );
            device.notify( illuminanceResource ).catch(
                function( error ) {
                    console.log( "Illuminance: Failed to notify observers." );
                    noObservers = error.noObservers;
                    if ( noObservers ) {
                        if ( notifyObserversTimeoutId ) {
                            clearTimeout( notifyObserversTimeoutId );
                            notifyObserversTimeoutId = null;
                        }
                    }
                } );
        }

        // After all our clients are complete, we don't care about any
        // more requests to notify.
        if ( !noObservers ) {
            notifyObserversTimeoutId = setTimeout( notifyObservers, 2000 );
        }
    } );
}

// Event handlers for the registered resource.
function observeHandler( request ) {
    noObservers = false;
    hasUpdate = true;
    readSensorData( function() {
        request.sendResponse( illuminanceResource ).catch( handleError );

        if ( !notifyObserversTimeoutId ) {
            setTimeout( notifyObservers, 200 );
        }
    } );
}

function retrieveHandler( request ) {
    readSensorData( function() {
        request.sendResponse( illuminanceResource ).catch( handleError );
    } );
}

device.device = Object.assign( device.device, {
    name: "Smart Home Illuminance Sensor"
} );

function handleError( error ) {
    console.log( "Illuminance: Failed to send response with error " + error +
        " and result " + error.result );
}

device.platform = Object.assign( device.platform, {
    manufacturerName: "Intel",
    manufactureDate: new Date( "Fri Oct 30 10:04:17 (EET) 2015" ),
    platformVersion: "1.1.0",
    firmwareVersion: "0.0.1"
} );

// Enable presence
device.enablePresence().then(
    function() {

        // Setup Illuminance sensor pin.
        setupHardware();

        console.log( "\nCreate Illuminance sensor resource." );

        // Register illuminance resource
        device.register( {
            id: {
                path: resourceInterfaceName
            },
            resourceTypes: [ resourceTypeName ],
            interfaces: [ "oic.if.baseline" ],
            discoverable: true,
            observable: true,
            properties: getProperties()
        } ).then(
            function( resource ) {
                console.log( "Illuminance: register() resource successful" );
                illuminanceResource = resource;

                // Add event handlers for each supported request type
                device.addEventListener( "observerequest", observeHandler );
                device.addEventListener( "retrieverequest", retrieveHandler );
            },
            function( error ) {
                console.log( "Illuminance: register() resource failed with: " +
                    error );
            } );
    },
    function( error ) {
        console.log( "Illuminance: device.enablePresence() failed with: " + error );
    } );

// Cleanup on SIGINT
process.on( "SIGINT", function() {
    console.log( "Delete Illuminance sensor Resource." );

    // Remove event listeners
    device.removeEventListener( "observerequest", observeHandler );
    device.removeEventListener( "retrieverequest", retrieveHandler );

    // Unregister resource.
    device.unregister( illuminanceResource ).then(
        function() {
            console.log( "Illuminance: unregister() resource successful" );
        },
        function( error ) {
            console.log( "Illuminance: unregister() resource failed with: " +
                error + " and result " + error.result );
        } );

    // Disable presence
    device.disablePresence().then(
        function() {
            console.log( "Illuminance: device.disablePresence() successful" );
        },
        function( error ) {
            console.log( "Illuminance: device.disablePresence() failed with: " + error );
        } );

    if ( aio ) {
        sensorPin.close();
    }

    // Exit
    process.exit( 0 );
} );
