#!/bin/sh
echo 'Starting update requence'
node articles1Update.js  | ./node_modules/.bin/bunyan
node articles2ToDatabase.js  | ./node_modules/.bin/bunyan
node articles3ToFiles.js | ./node_modules/.bin/bunyan
node articles4Cleanup.js | ./node_modules/.bin/bunyan

node files1MoveComplete.js | ./node_modules/.bin/bunyan
node files2ToReleases.js | ./node_modules/.bin/bunyan
node files3Cleanup.js | ./node_modules/.bin/bunyan

node releases1MoveComplete.js | ./node_modules/.bin/bunyan
node releases1MoveIncomplete.js | ./node_modules/.bin/bunyan