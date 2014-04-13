/*
litre - v1.0.0

Written by Federico Pereiro (fpereiro@gmail.com) and released into the public domain.

Please refer to README.md to see what this is about.
*/

(function () {

   // *** SETUP ***

   var log = console.log;

   var dale = require ('dale');
   var teishi = require ('teishi');

   var redisLibrary = require ('redis');
   var redis = redisLibrary.createClient ();

   var litre = exports;

   // *** VALIDATION ***

   // Object containing validations.
   litre.v = {};

   // Validate litre tree.
   litre.v.tree = function (tree) {
      return teishi.stop ({
         compare: tree,
         to: 'array',
         test: teishi.test.type,
         label: 'litre tree'
      });
   }

   // Validate litre path, the first element of each branch, which is an array of strings.
   litre.v.path = function (path) {
      return teishi.stop ([{
         compare: path,
         to: 'array',
         test: teishi.test.type,
         label: 'litre path',
      }, {
         compare: path,
         to: 'string',
         multi: 'each',
         test: teishi.test.type,
         label: 'litre path step'
      }]);
   }

   // Validate litre leaf, the second element of each branch, which is a string.
   litre.v.leaf = function (leaf) {
      return teishi.stop ([{
         compare: leaf,
         to: 'string',
         test: teishi.test.type,
         label: 'litre leaf',
      }]);
   }

   // Validate litre branch.
   litre.v.branch = function (branch) {
      if (teishi.stop ([{
         compare: branch,
         to: 'array',
         test: teishi.test.type,
         label: 'litre branch'
      }, {
         compare: branch.length,
         to: 2,
         label: 'litre branch length',
      }])) return true;
      return litre.v.path (branch [0]) || litre.v.leaf (branch [0]);
   }

   // *** HELPER FUNCTIONS ***

   // litre.clean removes elements from an array that are either undefined or null. This function will be helpful when deleting elements from arrays.
   litre.clean = function (tree) {
      var output = [];
      dale.do (tree, function (v) {
         if (v !== undefined && v !== null) output.push (v);
      });
      return output;
   }

   litre.mix = function (old, New, where) {
      // validate old as litre collection
      // validate new as litre collection
      // validate where as path

      if (where) {
         New = dale.do (New, function (v) {
            v [0] = where.concat (v [0]);
            return v;
         });
      }

      var consistency_check = [];
      var inconsistent_element;

      dale.stop_on (New, false, function (v, k) {
         if (dale.stop_on (v [0], false, function (v2, k2) {
         // v2 and k2 are the elements of each selector on new
            if (v [0].length !== k2 + 1) {
               if (dale.stop_on (consistency_check, false, function (v3, k3) {
               // v3 and k3 are the elements that already passed the consistency check.
                  // We stringify to be able to compare arrays.
                  if (JSON.s (v3 [0]) === JSON.s (v [0].slice (0, k2 + 1))) return false;
               }) === false) return false;
            }
            else {
               if (dale.stop_on (consistency_check, false, function (v3, k3) {
                  if (v3 [0].length >= v [0].length) {
                     // We stringify to be able to compare arrays.
                     if (JSON.s (v [0]) === JSON.s (v3 [0].slice (0, v [0].length))) return false;
                  }
               }) === false) return false;
            }
         }) === false) {
            inconsistent_element = v;
            return false;
         }
         else consistency_check.push (v);
      });
      if (inconsistent_element !== undefined) {
         log ('Inconsistent New argument passed to "litre.mix". Offending argument is', inconsistent_element);
         return false;
      }

      dale.do (New, function (v, k) {
      // v and k are the elements of New
         dale.do (v [0], function (v2, k2) {
         // v2 and k2 are the elements of each selector on new
            if (v [0].length !== k2 + 1) {
               dale.do (old, function (v3, k3) {
               // v3 and k3 are each of the old elements
                  // We stringify to be able to compare arrays.
                  if (JSON.s (v3 [0]) === JSON.s (v [0].slice (0, k2 + 1))) delete old [k3];
               });
            }
            else {
               dale.do (old, function (v3, k3) {
                  if (v3 [0].length >= v [0].length) {
                     // We stringify to be able to compare arrays.
                     if (JSON.s (v [0]) === JSON.s (v3 [0].slice (0, v [0].length))) delete old [k3];
                  }
               });
            }
         });
      });
   }

   litre.remove = function (tree, path) {
      if (litre.v.tree (tree)) return false;
      if (litre.v.path (path)) return false;

      dale.do (tree, function (v, k) {
         var result = dale.stop_on (path, false, function (v2, k2) {
            if (v2 === v [0] [k2]) return true;
            else return false;
         });
         if (result) delete tree [k];
      });

      output = [];
      dale.do (tree, function (v) {
         if (v !== undefined && v !== null) output.push (v);
      });
      return output;
   }

   // *** litre from/to JSON ***

   /*
      litre.to takes a JSON and returns a litre tree.

      The function takes two arguments: a JSON object, which is required, and a litre path, which is optional.

      If you pass a litre path as the second argument, all the paths will start with the specified litre path. Example:
      litre.to ({a: 'b'})        // returns [[['a'], 'b']]
      litre.to ({a: 'b'}, ['c']) // returns [[['c', 'a'], 'b']]

      If any of the two inputs is invalid, the function will return false.

      If an empty array or object is passed, or the path passed does not match any of the branches contained in the converted JSON, an empty litre tree will be returned (which is represented by an empty array).

      Arrays are transformed in two ways: a) the indexes are increased by one; and b) the indexes are transformed into a string. Example:
      litre.to (['a', 'b', 'c']) // returns [[['1'], 'a'], [['2'], 'b'], [['3'], 'c']].
   */

   litre.to = function litre_to (JSON, path) {

      if (JSON.s (JSON) === false) return false;
      if (litre.v.path (path)) return false;

      // If the path is undefined, we set it to an empty array.
      if (path === undefined) {path = []}

      var result = dale.do (JSON, function (v, k) {
         // If k is a number, we're dealing with an array. We add 1 to the key and convert it into a string.
         teishi.type (k) === 'number' ? k = k + 1 + '' : k = k;
         if (teishi.type (v) !== 'array' && teishi.type (v) !== 'object') {
            // If the value is not complex (ie: it doesn't contain other values inside), we convert the value to a string and return the branch.
            return [path.concat ([k]), v + ''];
         }
         else {
            // If the value is complex, we recursively call the function, concatenating the path to the current key.
            return litre_to (v, path.concat ([k]));
         }
      });

      if (result === []) return result;

      // If the result is not empty, we now have to unwrap the nested results. This is something I still don't fully understand, hence I can't explain it clearly. Just know that without this, the tree is not flattened and you have arrays of branches instead of just branches inside it.

      var output = [];
      dale.do (result, function (v) {
         // If the first element of the path is a string, it's a branch, hence we push it.
         if (teishi.type (v [0] [0]) === 'string') {
            output.push (v);
         }
         else {
         // We unwrap the nested returns from JSON_to_litre, in a single level. Since we do this each time we call the function, we don't need to do it deeply at the end. At every call of the function we return an array with the proper nestedness.
            dale.do (v, function (v2) {output.push (v2)});
         }
      });
      return output;
   }

   litre.from = function (tree, path) {
      if (path === undefined) path = [];
      if (litre.v.tree (tree)) return false;
      if (litre.v.path (path)) return false;

      var matches = [];

      if (path === []) {
      // We want it all!
         matches = tree;
      }

      else {
         dale.do (tree, function (v) {
            if (litre.v.path (v [0])) return false;
            // If length of current path is less than of received path, then it can't be what we're looking for.
            if (path.length > v [0].length) return false;

            var result = dale.stop_on (path, false, function (v2, k2) {
               // Each element in path must match the equivalent in current path.
               if (v2 !== v [0] [k2]) {
                  return false;
               }
               else {
                  return true;
               }
            });
            // We remove the elements that match the path. Notice that if it exactly matches the path (because we're getting a terminal value), the selector will now be an empty array.
            v [0].splice (0, path.length);
            if (result !== false) {
               matches.push (v);
            }
         });
      }

      // We return an empty object because there were no matches.
      if (matches.length === 0) return {};

      var output = {};

      dale.do (matches, function (v) {
         if (v [0].length === 0) {
            output = v [1];
         }
         // XXX We are using eval
         // We make v [1] into a string.
         v [1] = v [1] + '';
         value = '"' + v [1].replace (/"/g, '\\"').replace (/\n/g, '\\n') + '"';
         var eval_string = 'output';
         // The below doesn't get run if the selector is [].
         dale.do (v [0], function (v2, k2) {
            eval_string += ' ["' + v2 + '"]';
            if (k2 + 1 !== v [0].length) {
               if (eval (eval_string) === undefined) {
                  eval (eval_string + ' = {};');
               }
            }
            else {
               eval (eval_string + ' = ' + value + ';');
            }
         });
      });

      // XXX this should work eventually
      /*
      dale.do (matches, function (v, k) {
         output = litre.set (v [0], output, v [1]);
      });
      */

      return output;
   }

   // *** litre from/to redis ***




}).call (this);
