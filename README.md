# litre

Non-crude documentation coming soon!

**Warning: litre is not production ready at all and is under heavy development right now.**

**Warning 2: this readme is extremely crude. Right now, it's written for the purposes of letting me understanding the library while I develop it. Please don't try too hard reading this because it won't be worth it.**

## redis client

A redis client starts listening. modify config in the litre.js itself (it's at the top). if you do operations, they will be done on your redis, so be careful!

## litre uses astack

so you have to, too

## litre structures

- tree: array with zero or more branches
- branch: array with two elements, a path and a leaf.
- path: an array with one or more strings, none of which can be empty.
- leaf: a string.

Each branch holds a terminal value. See the following three examples:

```
{a: 'b'}```
turns into:
```
[[['a'], 'b']]```

----

```
['a', 'b']```
turns into:
```
[
  [['1'], 'a'],
  [['2'], 'b']
]```

----

```
{
   a: 'b',
   c: ['d', 'e']
}```
turns into:
```[
   [['a'], 'b'],
   [['c', '1'], 'd'],
   [['c', '2'], 'e']
]```

## functions

```litre.clean```: takes an array, returns false if input is invalid. remove undefined or null elements from an array. returns an array.

```litre.prepend```: takes a tree and a path. validates both inputs (the tree is validated deeply, at the branch level). puts the path in front of every path in the branch. returns the modified tree.

```litre.toPath```: takes an array of strings and numbers. increments the numbers by one and converts them to string. useful for iterating JSONs and generating paths.

```litre.fromPath```: takes a path and returns an array of strings and numbers, decrementing stringified integers by one and putting them in number form.

```litre.pick```: takes a tree and a path. returns tree with all the elements that match the path. by matching, we mean that every branch contains in its path the first n elements of the path passed, where n is the length of the path passed.

```litre.pickJSON```: takes a JSON and a path. returns a JSON with all the elements that match the path. by matching, we mean that every branch contains in its path the first n elements of the path passed, where n is the length of the path passed.


`litre.branch_consistent_in_tree`, takes tree and branch, and check that the branch can belong to that tree. returns true/false.

`litre.consistent_tree`, takes tree, does branch_consistent_in_tree, if true pushes that branch to an accumulator array. if we got to the end without errors, we return true. else, we return false.

### Side note on tree consistency

What's forbidden is for a path to be a terminal and a nonterminal at the same time. It is a terminal if there is a branch which has it as a path. It is a nonterminal if there's a branch that contains the path as a subpath.

The check is done iterating the path till n-1, and then testing long branch paths to n + arbitrary paths.

using sloppy pseudo math, a tree is inconsistent if there's a branch with path a1, a2, am and there is some other branch that has as path a1, or a1, a2, or a1... am OR a1, a2... am, x, y, z, where x y z are any possible strings.

## back to functions

### JSON to/from litre

`litre.toLitre` receives a JSON and an optional path (that can also be an empty array). It returns false if there was a validation error, or a tree. If the path is defined, it is prepended to each path in the returned tree. Actually, it is not a JSON, but any object or array.
In the tree, arrays are dezeroindexed, so that [['a'], ['b']] turns into [[['1'], 'a'], [['2'], 'b']]
If JSON is an empty array or object, the tree will be an empty array.
terminal values are stringified by adding an empty string to them.

`litre.combine` takes two arrays or objects and merges them into a single object or array. If matching keys point to an array and an object at the same time, an error is returned. Null or undefined are overridden. If two locations are defined for both objects and neither is an object or array, the ones of the second object prevail.

`litre.toJSON` receives a tree. If it is invalid, it returns false. It dezeroindexes paths that are stringified integers. This means that if you are using JSONs that have numeric keys, you have to make all of them integers (ie: amenable to array conversion), otherwise you will get an error. Procedure wise, this function generates an object per each branch (going from the last step to the first) and then litre.combines each object into an accumulator object.
if the tree is empty, an empty object is returned.
notice that terminal values are not destringified, so if you passed a number to litre.toLitre and then applied litre.toJSON, you won't get the same object.
explain unrooting!!!

### return and aReturn

if function has aStack, by return I mean aReturn, and sometimes return is put before it to not execute what's below.

### writing paths

must zeroindex and stringify. maybe i should make an option that if path is a number, it is incremented and stringified, but am not sure about the usefulness of that.

### represents non empty objects!

if empty objects/arrays, they won't exist! we only point to what has terminal values inside.

give example of get with one of the keys being undefined, you don't get the key itself because of unrooting.

### redis to/from litre

`litre.get` receives a path or an array of paths. returns a tree, with the path (or paths) and their values. if no path is found, an empty tree (empty array) is returned. if you pass an empty array, ALL PATHS ARE GOT, EXCEPT FOR INDEX.

`litre.delete` receives a path or an array of paths. returns true if all operations succesful and false if not. if attempting to delete something that doesn't exist, no error is thrown, only if there was a redis error. if the array of paths passed is empty, ALL PATHS ARE DELETED.

`litre.set` receives a tree or a branch, which is converted into an tree. returns true if all operations are succesful and false if not. Errors are not returned but logged straight into the console. if the passed tree is empty, true is returned.
internally, it invokes litre.set_one and returns whatever litre.set_one returns.

`litre.getJSON` takes `aPath` and path or array of paths. invokes `litre.get` and then `litre.to`s the result. It will return a JSON or false.

## low-level functions for redis

`litre.sPath` epath to string key, which stringifies and removes last element (the closing "]"), so that subpaths can be matched when applying "keys sPath*".

`litre.pPath` string key to epath, adds the "]" and parses.

`litre.escape` escapes the globs for pattern matching, to use only when invoking "KEYS"

`litre.redis`, takes aStack, action and further arguments. validates the action, lowercases it, calls the corresponding node_redis method passing the arguments. if the query returns error, the error is logged and false is areturned. else, the return value obtained from node_redis is areturned.

`litre.find` takes aStack and a epath. if epath is empty, finds all keys. finds all keys (not their values, just the keys), using KEYS, the escaped stringified path, and aReturns the result. returns false if input is invalid. if nothing is found, returns empty array, if found one or more, it returns them in an array, in the form of paths (it applies litre.pPath to the results). if there is an error, returns false.

`litre.find_conflicts`, takes astack and path. it returns an array of paths (empty or not) with all the conflicting paths that exist.

`litre.delete_one` receives a path and deletes it in redis. if there was an error, returns false, otherwise returns true.

`litre.set_one` receives a branch and sets it in redis. it returns true or false, depending on if there was an error or not.

`litre.get_one` receives a path and gets it from redis, returning a tree. if the path wasn't found, an empty tree is returned. if there is an error in any of the calls made (there can be many because a path can point to many keys), the function returns false.

## storage in redis

one key per branch. key name is the path, passed through litre.sPath, which stringifies it and removes the "]" from the end. we'll name this the spath.

also, as any well designed system, it relies on an arbitrary global variable, which is the redis key INDEX. don't overwrite it, or you will influence future events.

when a key is added, also its spath is added to this INDEX, which is a sorted set. all spaths in index have 0 as its score. this is for fast retrieval of inconsistencies.

when a path is searched, it is spathed and then escaped (because the keys argument has a glob syntax), then passed to KEYS with a star afterwards. this should later be changed to zrangebylex in INDEX, because right now search is a O(N) operation (actually, it is usually faster, because KEYS commands with wildcard at the end run much faster). We don't do it right now because zrangebylex is bleeding edge redis.

when a path is added, we need to do a consistency check of the whole dataset. If we did it as we do it in the consistency functions, it would be a  O(N x M)) operation, where M is the length of the path to insert. This is unacceptable, so what we do is to use ZRANK in INDEX, which is O(log (N)), so in the end we have O(log (N) x M), which is acceptable.
the consistency check returns a number of paths to delete, which then are passed to `litre.delete_one`.
this should be done as an entire transaction.

when a path is deleted, both its key and its entry in INDEX are deleted.
this should be done as an entire transaction.

## Source code

The complete source code is contained in `litre.js`. It is about 720 lines long.

## License

litre is written by Federico Pereiro (fpereiro@gmail.com) and released into the public domain.
