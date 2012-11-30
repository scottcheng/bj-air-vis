var vis = function(data) {

};


// load data
d3.csv('data/normal.csv', function(normal) {
  d3.csv('data/co.csv', function(co) {
    d3.csv('data/o3.csv', function(o3) {
      d3.csv('data/locations.csv', function(locations) {
        vis({
          normal: normal,
          co: co,
          o3: o3,
          locations: locations
        });
      });
    });
  });
});