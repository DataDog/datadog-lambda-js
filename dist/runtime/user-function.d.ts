/**
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Modifications copyright 2021 Datadog, Inc.
 *
 * The original file was part of aws-lambda-nodejs-runtime-interface-client
 * https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/utils/UserFunction.ts
 *
 * This module defines the functions for loading the user's code as specified
 * in a handler string.
 */
/**
 * Load the user's function with the approot and the handler string.
 * @param appRoot {string}
 *   The path to the application root.
 * @param handlerString {string}
 *   The user-provided handler function in the form 'module.function'.
 * @return userFuction {function}
 *   The user's handler function. This function will be passed the event body,
 *   the context object, and the callback function.
 * @throws In five cases:-
 *   1 - if the handler string is incorrectly formatted an error is thrown
 *   2 - if the module referenced by the handler cannot be loaded
 *   3 - if the function in the handler does not exist in the module
 *   4 - if a property with the same name, but isn't a function, exists on the
 *       module
 *   5 - the handler includes illegal character sequences (like relative paths
 *       for traversing up the filesystem '..')
 *   Errors for scenarios known by the runtime, will be wrapped by Runtime.* errors.
 */
export declare const load: (appRoot: string, fullHandlerString: string) => any;
//# sourceMappingURL=user-function.d.ts.map