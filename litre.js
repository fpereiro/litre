/*
litre - v0.1.0

Written by Federico Pereiro (fpereiro@gmail.com) and released into the public domain.

Please refer to README.md to see what this is about.
*/

(function () {

   // *** SETUP ***

   var log = console.log;

   var dale = require ('dale');
   var teishi = require ('teishi');
   var a = require ('astack');

   var redisLibrary = require ('redis');
   var redisClient = redisLibrary.createClient ();

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
      return (! teishi.stop ([{
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
      }]));
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
   litre.clean = function (tree) {
      if (litre.v.tree (tree) === false) return false;

      var output = [];
      dale.do (tree, function (v) {
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

   litre.get = function (tree, path) {
      if (litre.v.tree (tree) === false) return false;
      if (litre.v.path (path) === false) return false;

      var output = [];
      if (dale.stop_on (tree, false, function (v) {
         if (v [0].length < tree.length) return;
         if (litre.v.branch (v) === false) return false;
         if (dale.stop_on (path, false, function (v2, k2) {
            if (path [k2] !== v [0] [k2]) return false;
            else return true;
         }) === true) output.push (v);
      }) === false) return false;
      return output;
   }

   /*
      Inconsistency of a tree with respect to a branch

      Branch has path steps p1, p2, p3... pm

      Check every branch in the tree:

      If it has length 1, check that does match p1
      If it has length 2, check that does match p1, p2
      If it has length > m, check that matches p1... pm

   */

   litre.consistency_branch = function (branch, tree) {

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

   litre.consistency_tree = function (tree) {
      var consistent_branches = [];
      return dale.stop_on (tree, false, function (v) {
         if (litre.consistency_tree (v, consistent_branches)) {
            consistent_branches.push (v);
            return true;
         }
         else return false;
      });
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

      // If the path is undefined, we set it to an empty array.
      if (path === undefined) path = [];

      if (teishi.s (JSON) === false) return false;
      if (litre.v.path (path)) return false;

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
         label: 'Type of arguments'
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

   litre.from = function (tree) {

      var output;

      if (dale.stop_on (tree, false, function (v, k) {

         var branch_output;

         // Since a branch can't be inconsistent with itself, we use dale.do instad of dale.stop_on.
         dale.do (v [0], function (v2, k2) {

            // We reverse the loop.
            k2 = (v [0].length - 1 - k2);
            v2 = v [0] [k2];

            // If the step is a number, we convert it into a number and zeroindex it.
            if (isNaN (v2) === false) v2 = parseInt (v2) - 1;

            if (k2 === v [0].length - 1) {
               // We are at the last step of the path.
               if (isNaN (v2)) {
                  branch_output = {};
               }
               else {
                  branch_output = [];
               }
               branch_output [v2] = v [1];
            }
            else {
               if (isNaN (v2)) {
                  branch_output = {v2: branch_output}
               }
               else {
                  var temp = [];
                  temp [v2] = branch_output;
                  branch_output = temp;
               }
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

   litre.sPath = function (path) {
      if (litre.v.path (path) === false) return false;
      return teishi.s (path).slice (0, teishi.s (path).length - 1);
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
      })) return false;

      action = action.toLowerCase ();

      var Arguments = dale.do (arguments, function (v) {return v});
      Arguments = Arguments.slice (2, Arguments.length);

      redisClient [action] (Arguments, function (error, replies) {
         if (error) {
            log (error);
            a.aReturn (aStack, []);
         }
         else a.aReturn (aStack, replies !== null ? replies : []);
      });
   }

   litre.log = function (aStack) {
      log (aStack.last);
      a.aReturn (aStack, aStack.last);
   }

   litre.find = function (aStack, path) {
      a.aCall (aStack, [
         [litre.redis, 'KEYS', litre.escape (litre.sPath (path)) + '*'],
      ])
   }

   /*
      XXX explain this clearly
      Conflicts are with respect to a new path that has to be inserted.

      The problem is to have a path that is both a terminal and a nonterminal. This should never happen.

      If we're inserting a path that is [s1, s2, ... sm], where m is path length, we must remove all elements that:
      1) Have s1...sn as their FULL path, where n is less or equal than m
      2) Have s1...sm plus further steps as their path

   */

   litre.find_conflicts = function (aStack, path) {

      a.aCall (aStack, [
         // Find 1)
         [a.aFork, dale.do (path, function (v, k) {
            return [litre.redis, 'ZRANK', 'INDEX', litre.sPath (path.slice (0, k + 1))];
         })],
         [function (aStack) {
            var output = [];
            dale.do (aStack.last, function (v, k) {
               if (teishi.type (v) === 'number') output.push (path.slice (0, k + 1));
            });
            a.aReturn (aStack, output);
         }],
         // Find 2)
         [function (aStack) {
            var output = aStack.last;
            a.aCall (aStack, [
               [litre.find, path],
               [function (aStack) {
                  dale.do (output, function (v, k) {
                     output [k] = litre.sPath (output [k]);
                  });
                  a.aReturn (aStack, output.concat (aStack.last));
               }]
            ]);
         }],
      ]);
   }

   litre.in = function (aStack, path, value) {
      if (litre.v.path (path) === false) return false;
      if (teishi.type (value) !== 'string') return false;

      // XXX This should be a script so that it behaves as a transaction.

      a.aCall (aStack, [
         [litre.find_conflicts, path],
         [function (aStack) {
            var actions = [];
            dale.do (aStack.last, function (v) {
               actions.push ([litre.redis, 'DEL', v]);
               actions.push ([litre.redis, 'ZREM', 'INDEX', v]);
            });
            a.aFork (aStack, actions);
         }],
         [litre.redis, 'SET', litre.sPath (path), value],
         [litre.redis, 'ZADD', 'INDEX', 0, litre.sPath (path)],
      ]);
   }

   litre.out = function (aStack, path) {
      a.aCall (aStack, [
         [litre.find, path],
         [function (aStack) {
            aStack.paths = aStack.last;
            a.aFork (aStack, dale.do (aStack.last, function (v) {
               return [litre.redis, 'GET', v];
            }));
         }],
         [function (aStack) {
            var paths = aStack.paths;
            delete aStack.paths;
            a.aReturn (aStack, dale.do (aStack.last, function (v, k) {
               return [litre.pPath (paths [k]), v]
            }));
         }]
      ]);
   }

   a.aCall (undefined, [
      [litre.redis, 'FLUSHALL'],
      [litre.in, ['data'], 'v'],
      [litre.in, ['data', 'cars', '2'], 'v2'],
      [litre.in, ['data', 'cars', '3'], 'v3'],
      [litre.out, ['data', 'cars']],
      [litre.log],
   ]);

}).call (this);
