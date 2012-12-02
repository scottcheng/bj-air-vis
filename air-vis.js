var vis = function(data) {
  var POLLUTANTS = ['no2', 'so2', 'pm2_5', 'pm10'];
  var htmlPollutant = (function() {
    var mapping = {
      all: 'All',
      no2: 'NO<sub>2</sub>',
      so2: 'SO<sub>2</sub>',
      pm2_5: 'PM 2.5',
      pm10: 'PM 10'
    };
    return function(codename) {
      return mapping[codename];
    };
  })();
  var getPollutants = function(d) {
    var ret = [];
    var len = POLLUTANTS.length;
    for (var i = 0; i < len; i++) {
      if (d[POLLUTANTS[i]] != 'NULL') {
        ret.push(d[POLLUTANTS[i]]);
      }
    }
    return ret;
  };

  var colors = {
    greys: colorbrewer.Greys[9],
    all: colorbrewer.Blues[9],
    no2: colorbrewer.Greens[9],
    so2: colorbrewer.Purples[9],
    pm2_5: colorbrewer.Reds[9],
    pm10: colorbrewer.Oranges[9]
  };

  // prepare data
  var data = (function () {
    // prepare data
    data.byStation = d3.nest().key(function(d) {
      return d.place;
    }).entries(data.values);

    data.byStation.forEach(function(station) {
      // calculate mean pollution at each time stamp (<day, hour>)
      station.values.forEach(function(d) {
        d.value = d3.mean(getPollutants(d));
      });

      // break up pollutants
      var brokenUp = [];
      station.values.forEach(function(v) {
        POLLUTANTS.forEach(function(pollutant) {
          if (v[pollutant] !== 'NULL') {  // ditch NULLs
            brokenUp.push({
              place: v.place,
              time: v.time,
              hour: v.time.match(/ \d+/)[0].substr(1),
              pollutant: pollutant,
              value: v[pollutant]
            });
          }
        });
      });

      // calculate mean of aggregate pollution at this station
      station.value = d3.mean(brokenUp, function(d) {
        return d.value;
      });

      // group by pollutant types
      station.byPollutant = d3.nest().key(function(d) {
        return d.pollutant;
      }).entries(brokenUp);

      // calculate mean intensity of each pollutant at this stations
      station.byPollutant.forEach(function(pollutant) {
        station[pollutant.key] = d3.mean(pollutant.values, function(d) {
          return d.value;
        });
      });

      // for each pollutant, group by hour
      station.byPollutant.forEach(function(pollutant) {
        var byHour = d3.nest().key(function(d) {
          return d.hour;
        }).entries(pollutant.values);

        // get mean for each hour
        pollutant.byHour = [];
        byHour.forEach(function(hour) {
          pollutant.byHour.push({
            place: station.key,
            hour: hour.key,
            pollutant: pollutant.key,
            value: d3.mean(hour.values, function(d) {
              return d.value;
            })
          });
        });
      });
    });

    // calculate overall mean
    data.overall = (function() {
      var overall = {};

      var flattenByHour = [];
      data.byStation.forEach(function(station) {
        station.byPollutant.forEach(function(pollutant) {
          pollutant.byHour.forEach(function(hour) {
            flattenByHour.push({
              hour: hour.hour,
              pollutant: hour.pollutant,
              value: hour.value
            });
          });
        });
      });

      // group by pollutant
      overall.byPollutant = d3.nest().key(function(d) {
        return d.pollutant;
      }).entries(flattenByHour);

      // for each pollutant, group by hour
      overall.byPollutant.forEach(function(pollutant) {
        var byHour = d3.nest().key(function(d) {
          return d.hour;
        }).entries(pollutant.values);

        // get mean for each hour
        pollutant.byHour = [];
        byHour.forEach(function(hour) {
          pollutant.byHour.push({
            hour: hour.key,
            pollutant: pollutant.key,
            value: d3.mean(hour.values, function(d) {
              return d.value;
            })
          });
        });
      });

      // calculate mean over stations for each time stamp (<day, hour>)

      // group data entries by time
      overall.byTime = d3.nest().key(function(d) {
        return d.time;
      }).entries(data.values);

      // calculate mean for each time stamp
      overall.byTime.forEach(function(time) {
        time.time = time.key;

        POLLUTANTS.forEach(function(pollutant) {
          time[pollutant] = d3.mean(time.values, function(d) {
            return d[pollutant];
          });
        });

        time.value = d3.mean(getPollutants(time));
      });

      return overall;
    })();

    data.MAX = d3.max(data.values, function(d) {
      return d3.max(getPollutants(d));
    });

    return data;
  })();

  console.log(data);

  var controller = (function() {
    var controller = {};

    // all ui states are maintained here
    // keys:
    // * scope: 'all' or 'station'
    // * id: station id, valid if scope == 'station'
    // * pollutant: 'all', or one of the pollutant names
    var state;

    var applyOpt = function(opt) {
      (opt.scope !== undefined) && (state.scope = opt.scope);
      (opt.id !== undefined) && (state.id = opt.id);
      (opt.pollutant !== undefined) && (state.pollutant = opt.pollutant);
    };

    var render = function() {
      map.plot(state);
      radial.plot(state);
      tiles.plot(state);
      pollutantSelector.render(state);
    };

    controller.init = function(opt) {
      state = opt;
      d3.select('#station-name').text('All Stations');
      render();
    };

    controller.deselectStation = function() {
      d3.select('#station-name').text('All Stations');

      applyOpt({
        scope: 'all'
      });
      render();
    };

    controller.selectStation = function(id, name) {
      d3.select('#station-name').text(name);

      applyOpt({
        scope: 'station',
        id: id
      })
      render();
    };

    controller.deselectPollutant = function() {
      applyOpt({
        pollutant: 'all'
      });
      render();
    }

    controller.selectPollutant = function(pollutant) {
      applyOpt({
        pollutant: pollutant
      });
      render();
    };

    return controller;
  })();

  var scaledColor = (function() {
    var scale = d3.scale.pow().exponent(.35)
      .domain([0, data.MAX])
      .range([0, 1]);

    var quantize = d3.scale.quantize()
      .domain([0, 1]);

    return function(x, pollutant, colorRange) {
      colorRange || (colorRange = [0, 9]);
      quantize.range(colors[pollutant].slice(colorRange[0], colorRange[1]));
      return quantize(scale(x));
    };
  })();

  // plot map
  var map = (function() {
    var map = {};

    var margin = {
      top: 20,
      right: 5,
      bottom: 20,
      left: 5
    };
    var ratio = .6;
    var width = 852 * ratio;
    var height = 792 * ratio;

    var mapSVG = d3.select('svg.map')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // outline beijing by hand-drawing (i.e. w/o d3 api...)
    var path = d3.geo.path();
    mapSVG.append('path')
      .datum(data.map)
      .attr('class', 'map')
      .attr('d', function() {
        var getMappedCoord = function(i) {
          return data.map[i].x * ratio + ',' + data.map[i].y * ratio;
        };
        var ret = 'M' + getMappedCoord(0);
        var len = data.map.length;
        for (var i = 1; i < len; i++) {
          ret += 'L' + getMappedCoord(i);
        }
        ret += 'Z';
        return ret;
      });

    var radiusRange = [1, 15];
    var radius = {
      all: d3.scale.linear()
        .domain([0, d3.max(data.byStation, function(d) {
          return d.value;
        })])
        .range(radiusRange)
    };
    POLLUTANTS.forEach(function(pollutant) {
      radius[pollutant] = d3.scale.linear()
        .domain([0, d3.max(data.byStation, function(d) {
          return d[pollutant];
        })])
        .range(radiusRange);
    });

    mapSVG.selectAll('.location')
      .data(data.locations)
      .enter().append('circle')
        .attr('class', 'location')
        .attr('cx', function(d) {
          return d.x * ratio;
        })
        .attr('cy', function(d) {
          return d.y * ratio;
        })
        .on('click', function(d) {
          controller.selectStation(d.id, d.full_name);
          d3.event.stopPropagation();
        });
    mapSVG.on('click', function() {
      controller.deselectStation();
    });

    map.plot = function(opt) {
      var pollutantKey = opt.pollutant;
      (pollutantKey === 'all') && (pollutantKey = 'value')

      // color map
      mapSVG.selectAll('.map')
        .classed('active', function() {
          return (opt.scope === 'all');
        })
        .transition()
          .style('fill', function() {
            return colors[opt.pollutant][1];
          })
          .style('stroke', function() {
            return colors[opt.pollutant][8];
          });

      // update locations
      mapSVG.selectAll('.location')
        .classed('active', function(d) {
          return (opt.scope === 'station' && opt.id === d.id);
        })
        .transition()
          .attr('r', function(d) {
            var len = data.byStation.length;
            for (var i = 0; i < len; i++) {
              if (data.byStation[i].key === d.id) {
                return radius[opt.pollutant](data.byStation[i][pollutantKey]);
              }
            }
          })
          .style('fill', function(d) {
            var len = data.byStation.length;
            for (var i = 0; i < len; i++) {
              if (data.byStation[i].key === d.id) {
                return scaledColor(data.byStation[i][pollutantKey], opt.pollutant, [4, 9]);
              }
            }
          })
          .style('stroke', function(d) {
            return colors[opt.pollutant][8];
          });
    };

    return map;
  })();

  // plot radial
  var radial = (function() {
    var radial = {};

    // stack values for each stations and overall
    var stack = d3.layout.stack()
      .values(function(d) {
        return d.byHour;
      })
      .x(function(d) {
        return d.hour;
      })
      .y(function(d) {
        return d.value;
      });

    var layeredOverall = stack(data.overall.byPollutant);
    var layeredStations = [];
    data.byStation.forEach(function(station) {
      layeredStations.push(stack(station.byPollutant));
    });

    var width = 418;
    var height = 320;
    var radialSVG = d3.select('svg.radial')
      .attr('wdith', width)
      .attr('height', height)
      .append('g')
      .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');

    var outerRadius = width / 2;
    var innerRadius = 25;

    var angle = d3.scale.linear()
      .domain([0, 24])
      .range([0, 2 * Math.PI]);
    var radius = d3.scale.linear()
      .domain([0, d3.max(data.byStation, function(station) {
        return d3.max(station.byPollutant, function(pollutant) {
          return d3.max(pollutant.byHour, function(hour) {
            return hour.y0 + hour.y;
          });
        });
      })])
      .range([innerRadius, outerRadius]);

    var area = d3.svg.area.radial()
      .interpolate('cardinal-closed')
      .angle(function(d) {
        return angle(d.hour);
      })
      .innerRadius(function(d) {
        return radius(d.y0);
      })
      .outerRadius(function(d) {
        return radius(d.y0 + d.y);
      });

    // create an allZero data for smooth ease-in
    var allZero = [];
    POLLUTANTS.forEach(function(pollutant) {
      allZero.push({
        key: pollutant,
        byHour: (function() {
          var ret = [];
          for (var i = 0; i < 24; i++) {
            ret.push({
              hour: i,
              pollutant: pollutant,
              value: 0,
              y0: 0,
              y: 0
            })
          }
          return ret;
        })()
      });
    });

    // initial plot
    radialSVG.selectAll('.layer')
      .data(allZero)
      .enter().append('path')
        .attr('class', 'layer')
        .attr('d', function(d) {
          return area(d.byHour);
        })
        .on('click', function(d) {
          controller.selectPollutant(d.key);
        });

    // TODO change color when mouse over
    // TODO click to select pollutant

    radial.plot = function(opt) {
      switch (opt.scope) {
      case 'all':
        var layers = layeredOverall;
        break;
      case 'station':
        var len = layeredStations.length;
        for (var i = 0; i < len; i++) {
          var found = false;
          if (layeredStations[i][0].byHour[0].place == opt.id) {
            var layers = layeredStations[i];
            found = true;
            break;
          }
        }
        if (!found) {
          console.error('wrong id passed to radial.plot: ' + opt.id);
          return;
        }
        break;
      }

      radialSVG.selectAll('.layer')
        .data(layers)
        .classed('active', function(d) {
          return (opt.pollutant === d.key);
        })
        .transition()
          .attr('d', function(d) {
            return area(d.byHour);
          })
          .style('fill', function(d, i) {
            if (opt.pollutant === 'all') {
              return colors.all[2];
            } else if (opt.pollutant === d.key) {
              return colors[d.key][4];
            } else {
              return colors.greys[2];
            }
          });
    };

    return radial;
  })();

  // plot tiles
  var tiles = (function() {
    var tiles = {};

    var width = 418;
    var height = 150;
    var tilesSVG = d3.select('svg.tiles')
      .attr('width', width)
      .attr('height', height)
      .append('g');

    var gap = 1;
    var tileWidth = width / 24 - gap;
    var tileHeight = height / 14 - gap;

    // initial plot
    tilesSVG.selectAll('.tile')
      .data(data.overall.byTime)
      .enter().append('rect')
        .attr('class', 'tile')
        .attr('width', tileWidth)
        .attr('height', tileHeight)
        .attr('rx', 3)
        .attr('ry', 1)
        .attr('x', function(d) {
          return d.time.match(/ \d+/)[0] * (tileWidth + gap);
        })
        .attr('y', function(d) {
          return (d.time.match(/\/\d+\//)[0].substr(1, 2) - 17) * (tileHeight + gap);
        });

    tiles.plot = function(opt) {
      switch (opt.scope) {
      case 'all':
        var entries = data.overall.byTime;
        break;
      case 'station':
        var len = data.byStation.length;
        for (var i = 0; i < len; i++) {
          var found = false;
          if (data.byStation[i].key == opt.id) {
            var entries = data.byStation[i].values;
            found = true;
            break;
          }
        }
        if (!found) {
          console.error('wrong id passed to tiles.plot: ' + opt.id);
        }
        break;
      }

      tilesSVG.selectAll('.tile')
        .data(entries)
        .transition()
          .style('fill', function(d) {
            if (opt.pollutant === 'all') {
              return scaledColor(d.value, 'all');
            } else {
              return scaledColor(d[opt.pollutant], opt.pollutant);
            }
          });
    };

    return tiles;
  })();

  var pollutantSelector = (function() {
    var pollutantSelector = {};

    var options = ['all'];
    POLLUTANTS.forEach(function(pollutant) {
      options.push(pollutant);
    });
    var wrapper = d3.select('#pollutant-selector');

    wrapper.selectAll('div')
      .data(options)
      .enter().append('div')
        .attr('class', function(d) {
          return 'pollutant ' + d;
        })
        .html(function(d) {
          return htmlPollutant(d);
        })
        .style('border-top-color', function(d) {
          return colors[d][4];
        })
        .on('click', function(d) {
          controller.selectPollutant(d);
        });

    pollutantSelector.render = function(opt) {
      wrapper.selectAll('div')
        .classed('active', function(d) {
          return (opt.pollutant === d);
        });
    };

    return pollutantSelector;
  })();

  // initialize visualization
  controller.init({
    scope: 'all',
    pollutant: 'all'
  });
};


// load data
d3.csv('data/values.csv', function(values) {
  d3.csv('data/locations.csv', function(locations) {
    d3.csv('data/map.csv', function(map) {
      d3.csv('data/location-coord.csv', function(coord) {
        // integrate `coord` into `locations`
        for (var i = 0; i < locations.length; i++) {
          var found = false;
          for (var j = 0; j < coord.length; j++) {
            if (coord[j].id === locations[i].id) {
              found = true;
              locations[i].x = coord[j].x;
              locations[i].y = coord[j].y;
              break;
            }
          }
          if (!found) {
            // no coord for this location, remove
            locations.splice(i, 1);
            i--;
          }
        }
        vis({
          values: values,
          locations: locations,
          map: map
        });
      });
    });
  });
});