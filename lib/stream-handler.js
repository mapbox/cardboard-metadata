var queue = require('d3-queue').queue;
var extent = require('@turf/bbox');

var startMetadata = JSON.stringify({
    count: 0,
    size: 0,
    edits: 0,
    west: 180,
    south: 90,
    east: -180,
    north: -90
});

var utils = require('@mapbox/cardboard/lib/utils');
var streamHelper = require('@mapbox/cardboard').streamHelper;

// Partial failures would screw up the metadata with how this code is written right now...
// Is there a way to do a check on updated to make sure one failure doesn't destroy all...

module.exports = function(config, cardboardMetadata) {
    return streamHelper(['INSERT', 'REMOVE', 'MODIFY'], function(records, callback) {
        var updatesByDataset = records.reduce(function(datasets, change) {
            var idx = change.after ? change.after.key : change.before.key;
            var dataset = idx.split('!')[0];
            var update = datasets[dataset] || JSON.parse(startMetadata);
            update.edits++;

            if (change.action === 'INSERT') {
                update.size += change.after.size;
                update.count += 1;
            }

            if (change.action === 'REMOVE') {
                update.size -= change.before.size;
                update.count -= 1;
            }

            if (change.action === 'MODFIY') {
                update.size += change.before.size - change.after.size;
            }

            if (change.action === 'MODIFY' || change.action === 'INSERT') {
                var feature = utils.decodeBuffer(change.after.val);
                var bounds = extent(feature);
                update.west = update.west > bounds[0] ? bounds[0] : update.west;
                update.south = update.south > bounds[1] ? bounds[1] : update.south;
                update.east = update.east < bounds[2] ? bounds[2] : update.east;
                update.north = update.north < bounds[3] ? bounds[3] : update.north;
            }

            datasets[dataset] = update;
            return datasets;
        }, {});

        var q = queue();
        Object.keys(updatesByDataset).map(function(dataset) {
            var update = updatesByDataset[dataset]; 
            q.defer(cardboardMetadata.adjustProperties, dataset, {size: update.size, edits: update.edits, count: update.count});
            q.defer(cardboardMetadata.adjustBounds, dataset, [update.west, update.south, update.east, update.north]);
        });

        q.awaitAll(callback);
    });
}

