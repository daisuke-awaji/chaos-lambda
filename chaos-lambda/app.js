// This file is dual-licensed under MPL 2.0 and MIT - you can use the source form
// provided under the terms of either of those licenses.

var AWS = require('aws-sdk');
var config = require('./config.json');

AWS.config.region = config.region || 'eu-west-1';

exports.lambdaHandler = function(event, context, callback) {
  console.log('Chaos Lambda starting up');

  if (config.probability) {
    if (randomIntFromInterval(1,100) >= config.probability && config.probability != 100) {
      console.log('Probability says it is not chaos time');
      return context.done(null,null);
    }
  }

  var ec2 = new AWS.EC2();

  ec2.describeInstances(function(err, data) {
    if (err) {
      return context.done(err, null);
    }

    if (!data || data.Reservations.length === 0) {
      console.log('No instances found, exiting.');
      return context.done(null, null);
    }

    var candidates = [];

    data.Reservations.forEach(function(res) {
      res.Instances.forEach(function(inst) {
        if (inst.State.Name !== 'running') {
          return;
        };
        inst.Tags.forEach(function(tag) {
          if (tag.Key === 'aws:autoscaling:groupName') {
            // this instance is in an ASG
            if (config.enableForASGs) {
              // this takes precedence - if defined we don't even look at disableForASGs
              if (config.enableForASGs.indexOf(tag.Value) !== -1) {
                candidates.push(inst);
              }
            } else {
              if (config.disableForASGs) {
                if (config.disableForASGs.indexOf(tag.Value) === -1) {
                  candidates.push(inst);
                }
              }
            }
          };
          if (tag.Key === 'Name') {
            if(config.enableEc2TagNameValue) {
              if (config.enableEc2TagNameValue.indexOf(tag.Value) !== -1) {
                candidates.push(inst);
              }
            }
          };
        });
      });
    });

    console.log('candidates: %j', candidates);
    var numInstances = candidates.length;

    if (numInstances === 0) {
      console.log('No suitable instances found');
      return context.done(null);
    }

    var random = Math.floor(Math.random() * numInstances);
    var target = candidates[random];

    console.log('Going to terminate instance with id = %s', target.InstanceId);

    ec2.terminateInstances({InstanceIds:[target.InstanceId]}, function(err, data) {
      if (err) {
        return context.done(err, null);
      }

      console.log('Instance %s terminated', target.InstanceId);
      return context.done(null, data);
    });
  });

  response = {
      'statusCode': 200,
      'body': JSON.stringify({
          message: 'Chaos Lambda terminated instance.'
      })
  }
  callback(null, response);
};

function randomIntFromInterval(min,max)
{
    return Math.floor(Math.random()*(max-min+1)+min);
}
