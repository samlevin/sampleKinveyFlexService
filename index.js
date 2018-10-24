const fs = require('fs');
const sdk = require('kinvey-flex-sdk');

const packageJson = require('./package.json');

// It's a good practice to log service version at startup for
// informational, debuggingm and troubleshooting purposes
console.log(packageJson.version + ' init start');

// This block initializes the SDK using `options` provided
// in the object passed to the first parameter. It accepts a callback as its second paramater which
// contains an `err` if there was a problem starting the service or a `flex` instance otherwise.
//
// This specific service defines a `sharedSecret` named `link`. When creating an Internal Flex Service in the console, the `sharedSecret`
// associated with the service must match what is entered at Flex SDK initialization time
sdk.service({ sharedSecret: 'link' }, (err, flex) => {
  // `flex.functions` contains tools for mapping Kinvey Business Logic to functions/handlers in a Flex SDK service
  const flexFunctions = flex.functions;
  // `flex.data` contains tools for responding to Kinvey requests for collection data
  const flexData = flex.data;
  // `flex.logger` is a FSR-compliant logging utility which includes threshold support (e.g. `INFO`, `ERROR`, etc.).
  // The output of a `flex.logger` call will be visible when running `kinvey logs` via the Kinvey CLI
  const logger = flex.logger;

  // Initiate the flex auth
  const flexAuth = flex.auth;

  // A simple asynchronous sanity-check to ensure that the service cannot write to the filesystem (when deployed to the FSR).
  // This is disallowed in the present but there are plans to create an ephemeral file share per-service in the future
  fs.appendFile('./message.txt', 'data to append', (err) => {
    if (err) console.log('file unable to be created');
  });

  // A sample `flex.data` handler that responds to an `onGetAll` Kinvey query, e.g. `GET <kinvey-baas-URL>/CoolCollection`.
  // It responds using hard-coded data but typically a handler like this would make outbound request in order
  // to retrieve data to fulfill the request.
  //
  // The `request` parameter contains the request context made by the user. The `complete` parameter is the SDK completion handler
  // which should be invoked when the function is ready to respond to the Kinvey request. The `modules` parameter is a collection of
  // modules, some of which are initialized on a per-request basis, used to hook into various Kinvey functionality (e.g. sending push/email notifications).
  //
  // Check the [Data Handler Functions](https://devcenter.kinvey.com/nodejs/guides/flex-services#DataHandlerFunctions) section in Flex Services DevCenter guide
  // for more information on completion handler methods, status functions, and request pipeline chaining
  const getAllRecords = function(request, complete, modules) {
    // Hard-coded data to include in response
    const responseObject = { some: 15, data: 25 };

    logger.info('getAllRecords SDK request received');

    if (responseObject == null) {
      // An example of using the Flex SDK completion handler to return an `HTTP 404`
      return complete().setBody("The entity could not be found").notFound().next();
    } else  {
      // Here various properties are appended to the request to be used for development and troubleshooting purposes. These properties include
      // the intended response, the service version, and the node version
      request.responseObject = responseObject;
      request.serviceVersion = packageJson.version;
      request.nodeVersion = process.versions;

      logger.info('Preparing to return...');

      // This completion handler returns an `HTTP 200` response along with the initial request plus properties appended above. This is helpful for validating
      // that the expected request parameters are correctly generated and forwarded to Flex services when requests are made
      return complete().setBody(request).ok().next();
    }
  };

  // A sample `flex.data` handler that responds to an `onGetAllById` Kinvey query, e.g. `GET <kinvey-baas-URL>/CoolCollection/:1` (a request for a specific entity).
  // The implementation is the same as `onGetAll`
  const getRecordById = function(request, complete, modules) {
    const responseObject = { some: 15, data: 25 };

    logger.info('getRecordById SDK request received');

    if (responseObject == null) {
      return complete().setBody("The entity could not be found").notFound().next();
    } else  {
      request.responseObject = responseObject;
      request.serviceVersion = packageJson.version;
      request.nodeVersion = process.versions;

      logger.info('Preparing to return...');

      return complete().setBody(request).ok().next();
    }
  };

  // Gets a handle to a service object for Kinvey collection `CoolCollection`. `flex.data.serviceObject` is used to pair
  // handlers (i.e. the functions defined above) with Kinvey [data events](https://devcenter.kinvey.com/nodejs/guides/flex-services#DataEvents) for the purpose of responding to BaaS queries from node microservices
  const CoolCollectionServiceObject = flexData.serviceObject('CoolCollection');

  // When `CoolCollection` is queried with an ID, call `getRecordById`
  CoolCollectionServiceObject.onGetById(getRecordById);

  // When `CoolCollection` is queried without an identifier, call `getAllRecords`
  CoolCollectionServiceObject.onGetAll(getAllRecords);

  // Generic handler designed to be paired with Kinvey Business Logic. This code can be invoked pre/post fetch/save/delete (or with a dedicated custom endpoint, i.e. RPC-style).
  // This method invokes `done` on the `complete` handler, which ends all further processing and returns a response. In other words, if this business logic handler
  // is assigned to a pre-processing event, the next operation in the chain won't be called. Similarly to the Flex Data handlers defined above, this handler returns the request passed in.
  const sampleBusinessLogic = function(request, complete, modules) {
    setTimeout(() => {
      return complete().setBody(request).ok().done();
    }, 2000);
  };

  // Handler which sends an email. Use it with pre/post hooks to send emails before/after a fetch/save/delete
  // or wire it to a dedicated custom endpoint to send emails on-demand
  const emailer = function(request, complete, modules) {
    modules.email.send(
      'my-app@my-app.com',
      'sam@kinvey.com',
      'Test',
      'Test', (err, result) => {
        if (err) {
          logger.error(err);
          return complete().setBody(err).runtimeError().next();
        }
        logger.info('Email sent without issue')
        complete().ok().next();
    });
  };

  // Handler which sends a push broadcast. Use it with pre/post hooks to send push notifications before/after a fetch/save/delete
  // or wire it to a dedicated custom endpoint to send push notifications on-demand
  const pusher = function(request, complete, modules) {
    modules.push.broadcastMessage('bcast!', (err, result) => {
      if (err) {
        logger.error(err);
        return complete().setBody(err).runtimeError().next();
      }

      logger.info('Push sent without issue');
      complete().ok().next();
    });
  };

  // Handler which return a random generated auth token
  function authenticate(context, complete, modules) {
    const token = Math.random().toString(36).substring(7);
    return complete().setToken(token).ok().next();
  }
  // Register the authenticate function with flex auth
  flexAuth.register('myAuth', authenticate);

  // Use the Flex SDK (`flex.functions`) to export the functions above as BL handlers. The following handlers (`sampleBusinessLogic`, `pusher`, and `emailer`)
  // will be available in the Kinvey console when creating pre/post hooks or custom endpoints. Requests to these endpoints, or invocation of pre/post hooks will be
  // respectively forwarded to the functions defined above
  flexFunctions.register('sampleBusinessLogic', sampleBusinessLogic);
  flexFunctions.register('pusher', pusher);
  flexFunctions.register('emailer', emailer);
});
