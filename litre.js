/*
litre - v0.2.0

Written by Federico Pereiro (fpereiro@gmail.com) and released into the public domain.

Please refer to README.md to see what this is about.
*/

(function () {

   // *** SETUP ***

   // Useful shorthand.
   var log = console.log;

   // Require redis.
   var redisLibrary = require ('redis');
   var redisClient = redisLibrary.createClient ();

   redisClient
      .on ('ready', function () {
         log ('litre successfully connected to redis at', redisClient.host + ':' + redisClient.port + '!')})
      .on ('error', function (error) {
         log ('redis error:', error)});

   // Require astack, dale and teishi.
   var a = require ('astack');
   var dale = require ('dale');
   var teishi = require ('teishi');

   var litre = exports;

   // *** VALIDATION ***

   // Object containing validations.
   litre.v = {};

   // Validate litre tree.
   litre.v.tree = function (tree) {
      return (! teishi.stop ({
         compare: tree,
         to: 'array',
         test: teishi.test.type,
         label: 'litre tree'
      }));
   }

   // Validate litre path, the first element of each branch, which is an array of strings.
   litre.v.path = function (path) {
      if (teishi.stop ([{
         compare: path,
         to: 'array',
         test: teishi.test.type,
         label: 'litre path',
      }, {
         // This is hackish, but I don't want to write teishi.test.greater
         compare: path.length < 1,
         to: false,
         label: 'Path length cannot be empty!'
      }, {
         compare: path,
         to: 'string',
         multi: 'each',
         test: teishi.test.type,
         label: 'litre path step'
      }])) return false;
      return dale.stop_on (path, false, function (v) {
         if (v.length === 0) return false;
         else return true;
      });
   }

   // Validate litre paths.
   litre.v.paths = function (paths) {
      return (! teishi.stop ({
         compare: paths,
         to: 'array',
         test: teishi.test.type,
         label: 'litre paths object'
      }));
   }

   litre.v.epath = function (epath) {
      if (teishi.type (epath) === 'array' && epath.length === 0) return true;
      else return litre.v.path (epath);
   }

   // Validate litre leaf, the second element of each branch, which is a string.
   litre.v.leaf = function (leaf) {
      return (! teishi.stop ([{
         compare: leaf,
         to: 'string',
         test: teishi.test.type,
         label: 'litre leaf',
      }]));
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
      }])) return false;
      return litre.v.path (branch [0]) && litre.v.leaf (branch [1]);
   }

   // *** HELPER FUNCTIONS ***

   // litre.clean removes elements from an array that are either undefined or null. This function will be helpful when deleting elements from arrays.
   litre.clean = function (array) {
      if (teishi.type (array) !== 'array') return false;

      var output = [];
      dale.do (array, function (v) {
         if (v !== undefined && v !== null) output.push (v);
      });
      return output;
   }

   /*
      litre.prepend takes a tree and a path. It then goes through every branch, and prepends the path to each branch path.

      For example:

      litre.prepend ([
         [['a'], 'b'],
         [['c', 'd'], 'e']
      ], ['pre'])

      returns [
         [['pre', 'a'], 'b'],
         [['pre', 'c', 'd'], 'e']
      ]
   */

   litre.prepend = function (tree, path) {
      if (litre.v.tree (tree) === false) return false;
      if (dale.stop_on (tree, false, function (v) {
         return litre.v.branch (v);
      }) === false) return false;
      if (litre.v.path (path) === false) return false;

      var output = [];
      dale.do (tree, function (v) {
         v [0] = path.concat (v [0]);
         output.push (v);
      });
      return output;
   }

   litre.isInteger = function (string) {
      return ! isNaN (parseInt (string) % 1);
   }

   // takes a path of strings and numbers. since always output will be used as path, we validate as little as possible.
   litre.toPath = function (array) {
      if (teishi.stop ({
         compare: array,
         to: 'array',
         test: teishi.test.type,
         label: 'Array passed to litre.toPath'
      })) return false;
      return dale.do (array, function (v) {
         if (teishi.type (v) === 'number') return v + 1 + '';
         else return v;
      });
   }

   litre.fromPath = function (path) {
      if (litre.v.path (path) === false) return false;
      return dale.do (path, function (v) {
         if (litre.isInteger (v)) return parseInt (v) - 1;
         else return v;
      });
   }

   litre.pick = function (tree, path) {
      if (litre.v.tree (tree) === false) return false;
      if (litre.v.path (path) === false) return false;

      var output = [];
      if (dale.stop_on (tree, false, function (v) {
         if (v [0].length < path.length) return;
         if (litre.v.branch (v) === false) return false;
         if (dale.stop_on (path, false, function (v2, k2) {
            if (path [k2] !== v [0] [k2]) return false;
            else return true;
         }) === true) output.push (v);
      }) === false) return false;
      return output;
   }

   // Receives a javascript array or object and a litre path.
   // Returns the value indicated by the selector.
   /* Example:
      var a = [1, 2, {b: 'c'}];
      litre.pickJSON (a, [2, 'b']) -> returns 'c'
   */
   litre.pickJSON = function (object, path) {
      if (litre.v.path (path) === false) return false;
      if (teishi.stop ({
         compare: object,
         to: ['object', 'array'],
         multi: 'one_of',
         test: teishi.test.type,
         label: 'object passed to litre.pickJSON'
      })) return false;

      if (path.length === 1) {
         return object [path [0]];
      }
      else {
         var step = path.shift ();
         // Undefined can only be a terminal value, but since we have more than one step left in the path, what we're looking for in the object doesn't exist.
         if (object [step] === undefined) {
            return teishi.e (['step', step, 'not found in object', object]);
         }
         return litre.pickJSON (object [step], path);
      }
   }


   /*
      Inconsistency of a tree with respect to a branch

      Branch has path steps p1, p2, p3... pm

      Check every branch in the tree:

      If it has length 1, check that does match p1
      If it has length 2, check that does match p1, p2
      If it has length > m, check that matches p1... pm

   */

   litre.branch_consistent_in_tree = function (tree, branch) {

      if (litre.v.branch (branch) === false) return false;
      if (litre.v.branch (tree) === false) return false;

      if (tree.length === 0) return true;
      return dale.stop_on (tree, false, function (v) {
         var left;
         var right;
         if (v [0].length > branch [0].length) {
            left = v [0].slice (0, branch [0].length);
            right = branch [0].length;
         }
         else {
            left = v [0];
            right = branch [0].slice (0, v [0].length);
         }
         if (teishi.s (left) === teishi.s (right)) {
            log ('Inconsistent branch!', branch [0], 'clashes with', v [0]);
            return false;
         }
         else return true;
      });
   }

   litre.consistent_tree = function (tree) {
      var consistent_branches = [];
      return dale.stop_on (tree, false, function (v) {
         if (litre.branch_consistent_in_tree (v, consistent_branches)) {
            consistent_branches.push (v);
            return true;
         }
         else return false;
      });
   }

   // *** litre from/to JSON ***

   /*
      litre.toLitre takes a JSON and returns a litre tree.

      The function takes two arguments: a JSON object, which is required, and a litre path, which is optional.

      If you pass a litre path as the second argument, all the paths will start with the specified litre path. Example:
      litre.toLitre ({a: 'b'})        // returns [[['a'], 'b']]
      litre.toLitre ({a: 'b'}, ['c']) // returns [[['c', 'a'], 'b']]

      If any of the two inputs is invalid, the function will return false.

      If an empty array or object is passed, or the path passed does not match any of the branches contained in the converted JSON, an empty litre tree will be returned (which is represented by an empty array).

      Arrays are transformed in two ways: a) the indexes are increased by one; and b) the indexes are transformed into a string. Example:
      litre.toLitre (['a', 'b', 'c']) // returns [[['1'], 'a'], [['2'], 'b'], [['3'], 'c']].
   */

   litre.toLitre = function litre_toLitre (JSON, path) {

      // If the path is undefined, we set it to an empty array.
      if (path === undefined) path = [];

      if (path.length !== 0) {
      // We allow valid paths and an empty path as well.
         if (litre.v.path (path) === false) return false;
      }

      if (teishi.stop ({
         compare: JSON,
         to: ['array', 'object'],
         test: teishi.test.type,
         multi: 'one_of',
         label: 'JSON passed to litre.toLitre',
      })) return false;

      var result = dale.do (JSON, function (v, k) {
         // If k is a number, we're dealing with an array. We add 1 to the key and convert it into a string.
         teishi.type (k) === 'number' ? k = k + 1 + '' : k = k;
         if (teishi.type (v) !== 'array' && teishi.type (v) !== 'object') {
            // If the value is not complex (ie: it doesn't contain other values inside), we convert the value to a string and return the branch.
            return [path.concat ([k]), v + ''];
         }
         else {
            // If the value is complex, we recursively call the function, concatenating the path to the current key.
            return litre.toLitre (v, path.concat ([k]));
         }
      });

      if (result.length === 0) return result;

      // If the result is not empty, we now have to unwrap the nested results. This is something I still don't fully understand, hence I can't explain it clearly. Just know that without this, the tree is not flattened and you have arrays of branches instead of just branches inside it.

      var output = [];
      dale.do (result, function (v) {
         if (v.length === 0) return;
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

   litre.combine = function (first, second) {
      if (teishi.stop ([{
         compare: arguments,
         to: ['array', 'object'],
         test: teishi.test.type,
         multi: 'each_of',
         label: 'Argument passed to litre.combine'
      }, {
         compare: teishi.type (second),
         to: teishi.type (first),
         label: 'Type of arguments is inconsistent.'
      }])) return false;

      if (dale.stop_on (second, false, function (v, k) {

         if (teishi.type (v) !== 'array' && teishi.type (v) !== 'object') {
            // We don't override null or undefined values.
            if (v === null || v === undefined) return true;
            first [k] = v;
         }
         else {
            if (teishi.type (first [k]) !== 'array' && teishi.type (first [k]) !== 'object') {
               // If first [k] is a simple value, we override it.
               first [k] = v;
            }
            else {
               // If it's a complex value, we combine it recursively!
               var recursive_result = litre.combine (first [k], v);
               if (recursive_result === false) return false;
               first [k] = recursive_result;
            }
         }
      }) === false) return false;
      else return first;
   }

   litre.unroot = function (tree) {

      if (litre.v.tree (tree) === false) return false;

      if (tree.length === 0) return [];

      if (litre.v.branch (tree [0]) === false) return false;

      var root = tree [0] [0]

      dale.stop_on (tree, 0, function (v) {
         dale.stop_on (v [0], false, function (v2, k2) {
            if (root [k2] !== v2) {
               root = root.slice (0, k2);
               return false;
            }
         });
         return root.length;
      });

      return dale.do (tree, function (v) {
         v [0] = v [0].slice (0 + root.length, v [0].length);
         return v;
      });

   }

   // XXX From tree to JSON

   litre.toJSON = function (tree) {

      if (litre.v.tree (tree) === false) return false;

      if (tree.length === 0) return {};

      tree = litre.unroot (tree);

      var output;

      if (dale.stop_on (tree, false, function (v, k) {
         var branch_output;

         // Since a branch can't be inconsistent with itself, we use dale.do instead of dale.stop_on.
         dale.do (v [0], function (v2, k2) {

            // We reverse the loop.
            k2 = (v [0].length - 1 - k2);
            v2 = v [0] [k2];

            // If the step is a number, we convert it into a number and zeroindex it.
            if (litre.isInteger (v2)) v2 = parseInt (v2) - 1;

            if (k2 === v [0].length - 1) {
               // We are at the last step of the path.
               if (litre.isInteger (v2) === false) {
                  branch_output = {};
               }
               else {
                  branch_output = [];
               }
               branch_output [v2] = v [1];
            }
            else {
               var temp = litre.isInteger (v2) ? [] : {};
               temp [v2] = branch_output;
               branch_output = temp;
            }
         });

         if (k === 0) output = branch_output;

         else {
            if (litre.combine (output, branch_output) === false) return false;
            else output = litre.combine (output, branch_output);
         }
      }) === false) return false;
      else return output;
   }

   // *** litre in/out redis ***

   litre.sPath = function (epath) {
      if (litre.v.epath (epath) === false) return false;
      return teishi.s (epath).slice (0, teishi.s (epath).length - 1);
   }

   litre.pPath = function (string) {
      if (teishi.type (string) !== 'string') return false;
      return teishi.p (string + ']');
   }

   litre.escape = function (string) {
      if (teishi.type (string) !== 'string') return false;
      return string
         .replace ('\\', '\\\\')
         .replace ('[', '\\[')
         .replace (']', '\\]')
         .replace ('?', '\\?')
         .replace ('*', '\\*');
   }

   litre.redis = function (aStack, action) {

      // Taken from http://redis.io/commands
      var redis_commands = ['APPEND', 'AUTH', 'BGREWRITEAOF', 'BGSAVE', 'BITCOUNT', 'BITOP', 'BITPOS', 'BLPOP', 'BRPOP', 'BRPOPLPUSH', 'CLIENT KILL', 'CLIENT LIST', 'CLIENT GETNAME', 'CLIENT PAUSE', 'CLIENT SETNAME', 'CONFIG GET', 'CONFIG REWRITE', 'CONFIG SET', 'CONFIG RESETSTAT', 'DBSIZE', 'DEBUG OBJECT', 'DEBUG SEGFAULT', 'DECR', 'DECRBY', 'DEL', 'DISCARD', 'DUMP', 'ECHO', 'EVAL', 'EVALSHA sha1', 'EXEC', 'EXISTS', 'EXPIRE', 'EXPIREAT', 'FLUSHALL', 'FLUSHDB', 'GET', 'GETBIT', 'GETRANGE', 'GETSET', 'HDEL', 'HEXISTS', 'HGET', 'HGETALL', 'HINCRBY', 'HINCRBYFLOAT', 'HKEYS', 'HLEN', 'HMGET', 'HMSET', 'HSET', 'HSETNX', 'HVALS', 'INCR', 'INCRBY', 'INCRBYFLOAT', 'INFO', 'KEYS', 'LASTSAVE', 'LINDEX', 'LINSERT', 'LLEN', 'LPOP', 'LPUSH', 'LPUSHX', 'LRANGE', 'LREM', 'LSET', 'LTRIM', 'MGET', 'MIGRATE', 'MONITOR', 'MOVE', 'MSET', 'MSETNX', 'MULTI', 'OBJECT', 'PERSIST', 'PEXPIRE', 'PEXPIREAT', 'PFADD', 'PFCOUNT', 'PFMERGE', 'PING', 'PSETEX', 'PSUBSCRIBE', 'PUBSUB', 'PTTL', 'PUBLISH', 'PUNSUBSCRIBE', 'QUIT', 'RANDOMKEY', 'RENAME', 'RENAMENX', 'RESTORE', 'RPOP', 'RPOPLPUSH', 'RPUSH', 'RPUSHX', 'SADD', 'SAVE', 'SCARD', 'SCRIPT', 'SCRIPT FLUSH', 'SCRIPT KILL', 'SCRIPT', 'SDIFF', 'SDIFFSTORE', 'SELECT', 'SET', 'SETBIT', 'SETEX', 'SETNX', 'SETRANGE', 'SHUTDOWN SAVE', 'SHUTDOWN NOSAVE', 'SINTER', 'SINTERSTORE', 'SISMEMBER', 'SLAVEOF', 'SLOWLOG', 'SMEMBERS', 'SMOVE', 'SORT', 'SPOP', 'SRANDMEMBER', 'SREM', 'STRLEN', 'SUBSCRIBE', 'SUNION', 'SUNIONSTORE', 'SYNC', 'TIME', 'TTL', 'TYPE', 'UNSUBSCRIBE', 'UNWATCH', 'WATCH', 'ZADD', 'ZCARD', 'ZCOUNT', 'ZINCRBY', 'ZINTERSTORE', 'ZRANGE', 'ZRANGEBYLEX', 'ZRANGEBYSCORE', 'ZRANK', 'ZREM', 'ZREMRANGEBYRANK', 'ZREMRANGEBYSCORE', 'ZREVRANGE', 'ZREVRANGEBYSCORE', 'ZREVRANK', 'ZSCORE', 'ZUNIONSTORE', 'SCAN', 'SSCAN', 'HSCAN', 'ZSCAN'];

      if (teishi.stop ({
         compare: action,
         to: redis_commands,
         multi: 'one_of',
         label: 'Action passed to litre.redis'
      })) return a.aReturn (aStack, false);

      action = action.toLowerCase ();

      var Arguments = dale.do (arguments, function (v) {return v});
      Arguments = Arguments.slice (2, Arguments.length);

      redisClient [action] (Arguments, function (error, replies) {
         if (error) {
            log (error);
            a.aReturn (aStack, false);
         }
         else a.aReturn (aStack, replies);
      });
   }

   litre.find = function (aStack, epath) {
      if (litre.v.epath (epath) === false) return a.aReturn (aStack, false);
      a.aCond (aStack, [litre.redis, 'KEYS', litre.escape (litre.sPath (epath)) + '*'], {
         false: [a.aReturn, false],
         default: [function (aStack) {
            a.aReturn (aStack, dale.do (aStack.last, function (v) {
               return litre.pPath (v);
            }));
         }]
      });
   }

   /*
      XXX explain this clearly
      Conflicts are with respect to a new path that has to be inserted.

      This is the same than the consistent branch/tree functions above, for liters.

      The problem is to have a path that is both a terminal and a nonterminal. This should never happen.

      If we're inserting a path that is [s1, s2, ... sm], where m is path length, we must remove all elements that:
      1) Have s1...sn as their FULL path, where n is less or equal than m
      2) Have s1...sm plus further steps as their path

   */

   litre.find_conflicts = function (aStack, path) {
      if (litre.v.path (path) === false) return a.aReturn (aStack, false);

      a.aCall (aStack, [
         [a.aStop, false, [
            [a.aFork, dale.do (path, function (v, k) {
               return [litre.redis, 'ZRANK', 'INDEX', litre.sPath (path.slice (0, k + 1))];
            })],
            [function (aStack) {
               a.aReturn (aStack, litre.clean (dale.do (aStack.last, function (v, k) {
                  if (teishi.type (v) === 'number') return path.slice (0, k + 1);
               })), 'first_result');
            }],
            [litre.find, path],
         ]],
         [function (aStack) {
            var result = aStack.last.concat (aStack.first_result);
            // We clean up the aStack
            delete aStack.first_result;
            a.aReturn (aStack, result);
         }]
      ]);
   }

   litre.delete_one = function (aStack, epath) {
      if (litre.v.epath (epath) === false) return a.aReturn (aStack, false);
      a.aCond (aStack, [litre.find, epath], {
         false: [a.aReturn, false],
         default: [function (aStack) {
            // If we don't find anything, we return true.
            if (aStack.last.length === 0) return a.aReturn (aStack, true);

            a.aCall (aStack, [
               [function (aStack) {
                  var actions = [];
                  dale.do (aStack.last, function (v) {
                     actions.push ([litre.redis, 'DEL', litre.sPath (v)]);
                     actions.push ([litre.redis, 'ZREM', 'INDEX', litre.sPath (v)]);
                  });
                  a.aFork (aStack, actions);
               }],
               [function (aStack) {
                  a.aReturn (aStack, dale.stop_on (aStack.last, false, function (v, k) {
                     if (v === false) return false;
                     else return true;
                  }));
               }]
            ]);
         }]
      });
   }

   litre.delete = function (aStack, paths) {
      if (litre.v.paths (paths) === false) return a.aReturn (aStack, false);

      // If paths is a single path, we wrap it in an array.
      if (teishi.type (paths [0]) === 'string' || paths.length === 0) paths = [paths];

      a.aCall (aStack, [
         [a.aFork, dale.do (paths, function (v) {
            return [litre.delete_one, v];
         })],
         [function (aStack) {
            var result;
            dale.do (aStack.last, function (v, k) {
               if (k === 0) result = v;
               else result = result && v;
            });
            a.aReturn (aStack, result);
         }]
      ]);
   }
   // XXX This should be a script so that it behaves as a transaction.
   litre.set_one = function (aStack, branch) {
      if (litre.v.branch (branch) === false) {
         return a.aReturn (aStack, false);
      }

      a.aStop (aStack, false, [
         [litre.find_conflicts, branch [0]],
         [function (aStack) {
            // A subtle point: if no conflicts are passed, we receive an empty array. But if we pass an empty array to litre.delete, it will delete ALL keys! So we only execute litre.delete if the array is not empty.
            if (aStack.last.length > 0) {
               litre.delete (aStack, aStack.last);
            }
            else a.aReturn (aStack, true);
         }],
         [litre.redis, 'SET', litre.sPath (branch [0]), branch [1]],
         [litre.redis, 'ZADD', 'INDEX', 0, litre.sPath (branch [0])],
         [a.aPick, {
            false: [a.aReturn, false],
            default: [a.aReturn, true]
         }]
      ]);
   }

   litre.set = function (aStack, tree) {

      if (litre.v.tree (tree) === false) return a.aReturn (aStack, false);

      // If the tree is a branch, we wrap it in an array to make it a tree.
      if (teishi.type (tree [0] [0]) === 'string') tree = [tree];

      a.aStop (aStack, false, dale.do (tree, function (v) {
         return [litre.set_one, v];
      }).concat ([[a.aPick, {
         false: [a.aReturn, false],
         default: [a.aReturn, true]
      }]]));
   }

   litre.get_one = function (aStack, epath) {
      if (litre.v.epath (epath) === false) return a.aReturn (aStack, false);
      a.aCond (aStack, [litre.find, epath], {
         false: [a.aReturn, false],
         default: [function (aStack) {
            // If we don't find anything, we return an empty array.
            if (aStack.last.length === 0) return a.aReturn (aStack, []);

            // We store the found paths in aStack.paths.
            aStack.paths = aStack.last;

            a.aCall (aStack, [
               [a.aFork, dale.do (aStack.paths, function (v) {
                  return [litre.redis, 'GET', litre.sPath (v)];
               })],
               [function (aStack) {
                  var output_tree = [];
                  if (dale.stop_on (aStack.last, false, function (v, k) {
                     // We return false if any of the values is false.
                     if (v === false) {
                        a.aReturn (aStack, false);
                        return false;
                     }
                     if (v !== null) output_tree.push ([aStack.paths [k], v]);
                     return true;
                  })) {
                     delete aStack.paths;
                     a.aReturn (aStack, output_tree);
                  }
               }]
            ]);
         }]
      });
   }

   litre.get = function (aStack, paths) {
      if (litre.v.paths (paths) === false) return aReturn (aStack, false);
      // If paths is a single path, we wrap it in an array.
      if (teishi.type (paths [0]) === 'string' || paths.length === 0) paths = [paths];

      a.aCall (aStack, [
         [a.aFork, dale.do (paths, function (v) {
            return [litre.get_one, v];
         })],
         // Semi-copy pasted from litre.get_one
         [function (aStack) {
            var output_tree = [];
            if (dale.stop_on (aStack.last, false, function (v, k) {
               // We return false if any of the values is false.
               if (v === false) {
                  a.aReturn (aStack, false);
                  return false;
               }
               dale.do (v, function (v2) {
                  output_tree.push (v2);
               });
               return true;
            })) {
               a.aReturn (aStack, output_tree);
            }
         }]
      ]);
   }

   litre.getJSON = function (aStack, paths) {
      a.aCall (aStack, [
         [litre.get, paths],
         [function (aStack) {
            a.aReturn (aStack, litre.toJSON (aStack.last));
         }]
      ]);
   }

}).call (this);
