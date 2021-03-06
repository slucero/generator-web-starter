'use strict';
var generators = require('yeoman-generator');
var _ = require('underscore');
var git = require('gitty');
var updateNotifier = require('update-notifier');
var path = require('path');
var yosay = require('yosay');

// Configs
var basic_config = require('./configs/basic');
var drupal_config = require('./configs/drupal');
var wordpress_config = require('./configs/wordpress');
var javascript_config = require('./configs/javascript');
var puppet_config = require('./configs/puppet');
var capistrano_config = require('./configs/capistrano');

module.exports = generators.Base.extend({
  engine : require('yeoman-hoganjs-engine'),

  start : function() {
    var package_path = path.join(this.sourceRoot(), '../../package.json');
    var pkg = require(package_path);

    var notifier = updateNotifier({
      packageName : pkg.name,
      packageVersion : pkg.version,
      updateCheckInterval : 1000 * 60 * 60 * 24 // daily
    });

    if (notifier.update && notifier.update.latest != notifier.update.current) {
      console.log(yosay('Update available: ' + notifier.update.latest + ' (current: ' + notifier.update.current + ')'
          + '\n\nRun npm update -g ' + pkg.name));
    }

    var done = this.async();
    done();
  },
  promptTask : function() {
    var repo = git(this.destinationRoot());
    var remotes = {};

    try {
      remotes = repo.getRemotesSync();
    } catch (e) {
      // If we're not in a repo it will cause an exception, we can trap this
      // silently
    }

    var defaults = {
      name : this.appname,
      repository : _.has(remotes, 'origin') ? remotes.origin : ''
    };

    var config = _.extend(defaults, basic_config.getDefaults(), drupal_config.getDefaults(), puppet_config
        .getDefaults(), capistrano_config.getDefaults(), this.config.getAll());

    var prompts = [].concat(basic_config.getPrompts(config), drupal_config.getPrompts(config), puppet_config
        .getPrompts(config), capistrano_config.getPrompts(config));

    var done = this.async();

    this.prompt(prompts, function(props) {
      _.extend(this, config, props);
      // Check to see if we should be using SASS / Compass
      // TODO: Make this less manual
      this.use_compass = (_.has(this, 'drupal_use_compass') && this.drupal_use_compass)
          || (_.has(this, 'wordpress_use_compass') && this.wordpress_use_compass);

      var that = this;

      _.each(props, function(val, key) {
        that.config.set(key, val);
      });

      // Set variables for platform
      // TODO: Fix duplication of labels
      that.is_drupal = (that.platform == 'drupal');
      that.is_wordpress = (that.platform == 'wordpress');
      that.is_javascript = (that.platform == 'javascript');

      done();
    }.bind(this));
  },
  app : function() {
    var that = this;
    var done = this.async();
    var config = this.config.getAll();

    this.remote('forumone', 'web-starter', that.refspec, function(err, remote) {
      if (err) {
        done.err(err);
      } else {
        // Build a map of template and target files
        var template_map = {};
        var templates = that.expand('**/_*', {
          cwd : remote.src._base
        });
        _.each(templates, function(template) {
          template_map[template] = path.dirname(template) + '/' + path.basename(template).substring(1);
        });

        // Get list of all files to transfer
        var files = that.expandFiles('**', {
          cwd : remote.src._base,
          dot : true
        });

        // Exclude templates and targets from general transfer
        var transfer_files = _.difference(files, _.values(template_map), _.keys(template_map));

        // Remove stages if they are defined in configuration
        if (_.has(config, 'stages')) {
          _.each(config.stages, function(value, key) {
            transfer_files = _.difference(transfer_files, [ 'config/deploy/' + key + '.rb' ]);
          });
        }
        
        // Copy files to the current
        _.each(transfer_files, function(file) {
          remote.copy(file, file);
        });

        // Process template files
        _.each(template_map, function(dest, source) {
          remote.template(source, dest, that);
        });

        done();
      }
    }, true);
  },
  setStages : function() {
    var config = this.config.getAll();
    var done = this.async();
    var that = this;

    this.remote('forumone', 'web-starter', that.refspec, function(err, remote) {
      // Set stage files from configuration 
      var stages = _.has(config, 'stages') ? config.stages : {};
      _.each(stages, function(value, key) {
        value.name = key;
        remote.template('config/deploy/_stage.rb', 'config/deploy/' + key + '.rb', value);
      });

      done();
    });
  },
  end : function() {
    var done = this.async();
    var npm_packages = [ 'grunt', 'grunt-contrib-concat', 'grunt-contrib-cssmin', 'grunt-contrib-jshint',
        'grunt-contrib-nodeunit', 'grunt-contrib-uglify', 'grunt-contrib-watch', 'grunt-shell', 'grunt-simple-watch',
        'grunt-contrib-coffee', 'load-grunt-tasks' ];

    if (this.use_compass) {
      npm_packages.push('grunt-contrib-compass');
    }

    this.npmInstall(npm_packages, {
      'saveDev' : true
    }, done);
  }
});
