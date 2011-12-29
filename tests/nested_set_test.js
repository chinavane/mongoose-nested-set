'use strict'

var testCase = require('nodeunit').testCase,
    mongoose = require('mongoose'),
    NestedSetPlugin = require('../lib/nested_set'),
    Schema = mongoose.Schema,
    async = require('async'),
    Helpers = require('./helpers');

var UserSchema,
    User

var tests = testCase({
  setUp: function(next) {
    async.series([
      function(callback) {
        mongoose.connect('mongodb://localhost/nested_set_test');
        callback();
      },
      function(callback) {
        UserSchema = new Schema({
          username: {type: String}
        });
        UserSchema.plugin(NestedSetPlugin);
        User = mongoose.model('User', UserSchema);
        callback();
      },
      function(callback) {
        // drop users from mongodb
        User.remove({}, callback);
      },
      function(callback) {
        // see diagram in docs/test_tree.png for a representation of this tree
        var michael = new User({username: 'michael'});

        var meredith = new User({username: 'meredith', parentId: michael._id});
        var jim = new User({username: 'jim', parentId: michael._id});
        var angela = new User({username: 'angela', parentId: michael._id});

        var kelly = new User({username: 'kelly', parentId: meredith._id});
        var creed = new User({username: 'creed', parentId: meredith._id});

        var phyllis = new User({username: 'phyllis', parentId: jim._id});
        var stanley = new User({username: 'stanley', parentId: jim._id});
        var dwight = new User({username: 'dwight', parentId: jim._id});

        var oscar = new User({username: 'oscar', parentId: angela._id});

        async.forEach([
          michael,
          meredith,
          jim,
          angela,
          kelly,
          creed,
          phyllis,
          stanley,
          dwight,
          oscar
        ], function(item, cb) { item.save(cb) }, function(err) {
          setTimeout(callback, 500);
        })
      },
      function(callback) {
        next();
      }
    ])
  },
  'is sane': function(test) {
    test.expect(3);
    test.ok(User);
    test.equal('function', typeof User);
    test.equal('User', User.modelName);
    test.done();
  },
  'has created users for testing': function(test) {
    test.expect(4);
    User.find(function(err, users) {
      if (err) { console.log(err); }
      test.ok(!err);
      test.ok(users);
      test.ok(users instanceof Array);
      test.equal(10, users.length);
      test.done();
    });
  },
  'can read parentIds as ObjectIDs': function(test) {
    User.find(function(err, users) {
      if (err) { console.log(err); }
      test.ok(!err);
      users.forEach(function(user) {
        if (user.parentId) {
          test.ok(Helpers.isObjectId(user.parentId));
        }
      });
      test.done();
    });
  },
  'rebuildTree should set lft and rgt based on parentIds': function(test) {
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.find(function(err, users) {
          // see docs/test_tree.png for the graphical representation of this tree with lft/rgt values
          users.forEach(function(person) {
            if (person.username === 'michael') {
              test.equal(1, person.lft);
              test.equal(20, person.rgt);
            } else if (person.username === 'meredith') {
              test.equal(2, person.lft);
              test.equal(7, person.rgt);
            } else if (person.username === 'jim') {
              test.equal(8, person.lft);
              test.equal(15, person.rgt);
            } else if (person.username === 'angela') {
              test.equal(16, person.lft);
              test.equal(19, person.rgt);
            } else if (person.username === 'kelly') {
              test.equal(3, person.lft);
              test.equal(4, person.rgt);
            } else if (person.username === 'creed') {
              test.equal(5, person.lft);
              test.equal(6, person.rgt);
            } else if (person.username === 'phyllis') {
              test.equal(9, person.lft);
              test.equal(10, person.rgt);
            } else if (person.username === 'stanley') {
              test.equal(11, person.lft);
              test.equal(12, person.rgt);
            } else if (person.username === 'dwight') {
              test.equal(13, person.lft);
              test.equal(14, person.rgt);
            } else if (person.username === 'oscar') {
              test.equal(17, person.lft);
              test.equal(18, person.rgt);
            }
          });
          test.done();
        });
      });
    });
  },
  'isLeaf should return true if node is leaf': function(test) {
    test.expect(2)
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          test.ok(kelly.isLeaf());
          User.findOne({username: 'michael'}, function(err, michael) {
            test.ok(!michael.isLeaf());
            test.done();
          });
        });
      });
    });
  },
  'isChild should return true if node has a parent': function(test) {
    test.expect(2)
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          test.ok(kelly.isChild());
          User.findOne({username: 'michael'}, function(err, michael) {
            test.ok(!michael.isChild());
            test.done();
          });
        });
      });
    });
  },
  'selfAndAncestors should return all ancestors higher up in tree + current node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          kelly.selfAndAncestors(function(err, people) {
            test.ok(!err);
            test.deepEqual(['kelly', 'meredith', 'michael'], people.map(function(p) {return p.username}).sort());
            test.done();
          });
        });
      });
    });
  },
  'ancestors should return all ancestors higher up in tree': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          kelly.ancestors(function(err, people) {
            test.ok(!err);
            test.deepEqual(['meredith', 'michael'], people.map(function(p) {return p.username}).sort());
            test.done();
          });
        });
      });
    });
  },
  'ancestors should return empty array if it is a root node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.ancestors(function(err, people) {
            test.ok(!err);
            test.deepEqual([], people.map(function(p) {return p.username}).sort());
            test.done();
          });
        });
      });
    });
  },
  'selfAndChildren should return all children + current node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.selfAndChildren(function(err, people) {
            test.ok(!err);
            test.deepEqual(
              ['angela', 'jim', 'meredith', 'michael'], 
              people.map(function(p) {return p.username}).sort());
            test.done();
          });
        });
      });
    });
  },
  'children should return all children': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.children(function(err, people) {
            test.ok(!err);
            test.deepEqual(['angela', 'jim', 'meredith'], people.map(function(p) {return p.username}).sort());
            test.done();
          });
        });
      });
    });
  },
  'selfAndDescendants should return all descendants + current node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.selfAndDescendants(function(err, people) {
            test.ok(!err);
            test.deepEqual(
              ['angela', 'creed', 'dwight', 'jim', 'kelly', 'meredith', 'michael', 'oscar', 'phyllis', 'stanley'], 
              people.map(function(p) {return p.username}).sort()
            );
            test.done();
          });
        });
      });
    });
  },
  'descendants should return all descendants': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.descendants(function(err, people) {
            test.ok(!err);
            test.deepEqual(
              ['angela', 'creed', 'dwight', 'jim', 'kelly', 'meredith', 'oscar', 'phyllis', 'stanley'], 
              people.map(function(p) {return p.username}).sort()
            );
            test.done();
          });
        });
      });
    });
  },
  'level should return 0 for root node': function(test) {
    test.expect(2)
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'michael'}, function(err, michael) {
          michael.level(function(err, value) {
            test.ok(!err);
            test.equal(0, value);
            test.done();
          });
        });
      });
    });
  },
  'selfAndSiblings should return all nodes with same parent node + current node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'meredith'}, function(err, meredith) {
          meredith.selfAndSiblings(function(err, people) {
            test.ok(!err);
            test.deepEqual(
              ['angela', 'jim', 'meredith'],
              people.map(function(p) {return p.username}).sort()
            );
            test.done();
          });
        });
      });
    });
  },
  'siblings should return all nodes with same parent node': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, user) {
      User.rebuildTree(user, 1, function() {
        User.findOne({username: 'meredith'}, function(err, meredith) {
          meredith.siblings(function(err, people) {
            test.ok(!err);
            test.deepEqual(
              ['angela', 'jim'],
              people.map(function(p) {return p.username}).sort()
            );
            test.done();
          });
        });
      });
    });
  },
  'kelly is a descendant of michael': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, michael) {
      User.rebuildTree(michael, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          test.ok(kelly.isDescendantOf(michael));
          test.ok(!michael.isDescendantOf(kelly));
          test.done();
        });
      });
    });
  },
  'michael is an ancestor of kelly': function(test) {
    test.expect(2);
    User.findOne({username: 'michael'}, function(err, michael) {
      User.rebuildTree(michael, 1, function() {
        User.findOne({username: 'kelly'}, function(err, kelly) {
          test.ok(michael.isAncestorOf(kelly));
          test.ok(!kelly.isAncestorOf(michael));
          test.done();
        });
      });
    });
  }
});

module.exports = tests;
