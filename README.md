# OpenCensus Zenoss Exporter for Node.js

A [Node.js] library intended to be used in [Node.js] applications instrumented
with [OpenCensus] to export stats to [Zenoss].

[Node.js]: https://nodejs.org/ 
[OpenCensus]: https://opencensus.io/
[Zenoss]: https://zenoss.com/

## Status

This library is in an alpha stage, and the API is subject to change.

## Usage

To use Zenoss as your exporter, you will first need a Zenoss API key. Once you
have an API key, add the following to your Node.js application.

For Javascript:
```javascript
const { globalStats } = require("@opencensuscore")
const { ZenossStatsExporter } = require("@zenoss/opencensus-node-exporter")

const exporter = new ZenossStatsExporter({ apiKey: "YOUR-ZENOSS-API-KEY" })
globalStats.registerExporter(exporter)
```

For TypeScript:
```typescript
import { globalStats } from "@opencensus/core";
import { ZenossStatsExporter } from "@zenoss/opencensus-node-exporter"

const exporter = new ZenossStatsExporter({ apiKey: "YOUR-ZENOSS-API-KEY" })
globalStats.registerExporter(exporter)
```

Be sure to install the exporter. For `npm` use the following:
```shell script
npm install @zenoss/opencensus-node-exporter
```

## Options

The following options are available when creating a `ZenossStatsExporter`.

- `address`: Zenoss API address. Default is https://api.zenoss.io.
- `apiKey`: Zenoss API key.
- `source`: Added as a tag to all sent metrics. Recommended.
- `extraTags`: Map of additional tags to add to all sent metrics. Default is {}.
- `period`: How often (in milliseconds) to send metrics to Zenoss. Default is 60000.
- `logger`: Optional logger to be used by the exporter.

## Example Application

The following is a complete example of an application that will write the value
`10` to a measure named `example.com/ten` once per second. Then once per minute
the last value of this metric will be sent to Zenoss with a metric name of
`example.com/ten_last`.

```javascript
const { globalStats, AggregationType, MeasureUnit, TagMap } = require('@opencensus/core')
const { ZenossExporter } = require('@zenoss/opencensus-node-exporter')

// Setup the Zenoss exporter.
const exporter = new ZenossExporter({ apiKey: "YOUR-ZENOSS-API-KEY" })
globalStats.registerExporter(exporter)

// Setup our tags.
const tagKeyApp = { name: "app" }
const tagMapTen = new TagMap()
tagMapTen.set(tagKeyApp, { value: "nodejs-example" })

// Create a measure.
const measureTen = globalStats.createMeasureInt64('example.com/ten', MeasureUnit.UNIT, "10: always and forever!")

// Create a "last value" view for the measure.
const viewTenLast = globalStats.createView(
    'example.com/ten_last',
    measureTen,
    AggregationType.LAST_VALUE,
    [tagKeyApp],
    'Last value of ten.'
)

globalStats.registerView(viewTenLast)

// Record a value for the measure once per second.
setInterval(() => {
    globalStats.record([{measure: measureTen, value: 10}], tagMapTen);
}, 1000);
``` 

## Useful Links
- To know more about Zenoss, visit: <https://zenoss.com>
- For more information on OpenCensus, visit: <https://opencensus.io/>
- To checkout the OpenCensus for Node.js, visit: <https://github.com/census-instrumentation/opencensus-node>
