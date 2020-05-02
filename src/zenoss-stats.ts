import {
    DistributionValue,
    ExporterConfig,
    logger,
    Logger,
    Measurement,
    MetricDescriptorType,
    MetricProducerManager,
    Metrics,
    StatsEventListener, SummaryValue,
    TagKey,
    TagValue, Timestamp,
    View,
} from '@opencensus/core';

const fetch = require('node-fetch');

export interface ZenossStatsExporterOptions extends ExporterConfig {
    // address: Zenoss API endpoint address.
    address?: string;

    // apiKey: Zenoss API key.
    apiKey?: string;

    // source: recommended tag identifying the source of data.
    source?: string;

    // extraTags: optional map of extra tags to add to every metric.
    extraTags?: { [key: string]: string };

    // period: how often (in milliseconds) to send metrics to Zenoss.
    period?: number;

    // logger: optional custom Logger to be used by the exporter.
    logger?: Logger;
}

export class ZenossStatsExporter implements StatsEventListener {
    static readonly DEFAULT_ADDRESS: string = "https://api.zenoss.io"
    static readonly DEFAULT_PERIOD: number = 60000;
    static readonly DEFAULT_SOURCE_TYPE: string = "zenoss/opencensus-node-exporter-zenoss";

    static readonly API_KEY_FIELD: string = "zenoss-api-key";
    static readonly SOURCE_FIELD: string = "source";
    static readonly SOURCE_TYPE_FIELD: string = "source-type";
    static readonly DESCRIPTION_FIELD: string = "description";
    static readonly UNITS_FIELD: string = "units";

    private readonly address: string;
    private readonly apiKey?: string;
    private readonly extraTags: { [key: string]: string };
    private readonly period: number;
    private readonly logger: Logger;

    private timer!: NodeJS.Timer;

    constructor(options: ZenossStatsExporterOptions) {
        this.address = options.address || ZenossStatsExporter.DEFAULT_ADDRESS;
        this.apiKey = options.apiKey;
        this.extraTags = options.extraTags || {};
        this.period = options.period || ZenossStatsExporter.DEFAULT_PERIOD;
        this.logger = options.logger || logger.logger();

        if (!this.extraTags[ZenossStatsExporter.SOURCE_TYPE_FIELD]) {
            this.extraTags[ZenossStatsExporter.SOURCE_TYPE_FIELD] = ZenossStatsExporter.DEFAULT_SOURCE_TYPE;
        }

        if (options.source) {
            if (!this.extraTags[ZenossStatsExporter.SOURCE_FIELD]) {
                this.extraTags[ZenossStatsExporter.SOURCE_FIELD] = options.source
            }
        }
    }

    start(): void {
        this.timer = setInterval(async () => {
            try {
                await this.export();
            } catch (err) {
                this.logger.error("failed to export metrics: %s", err)
            }
        }, this.period);
    }

    async export() {
        const now = Date.now() / 1000;
        const taggedMetrics: TaggedMetric[] = [];
        const metricProducerManager: MetricProducerManager = Metrics.getMetricProducerManager();

        const addMetric = (name: string, timestamp: Timestamp, value: number, tags: { [k: string]: string }) => {
            taggedMetrics.push({
                metric: name,
                timestamp: (timestamp.seconds || now) * 1000,
                value: value,
                tags: tags,
            })
        }

        for (const metricProducer of metricProducerManager.getAllMetricProducer()) {
            for (const metric of metricProducer.getMetrics()) {
                for (const timeSeries of metric.timeseries) {
                    const tags: { [key: string]: string } = {};

                    for (let i = 0; i < timeSeries.labelValues.length; i++) {
                        const labelKey = metric.descriptor.labelKeys[i];
                        const labelValue = timeSeries.labelValues[i].value;
                        if (labelKey && labelValue !== null && labelValue !== undefined) {
                            tags[labelKey.key] = labelValue;
                        }
                    }

                    if (metric.descriptor.description) {
                        tags[ZenossStatsExporter.DESCRIPTION_FIELD] = metric.descriptor.description;
                    }

                    if (metric.descriptor.unit) {
                        tags[ZenossStatsExporter.UNITS_FIELD] = metric.descriptor.unit;
                    }

                    // extraTags override metric tags.
                    for (const k in this.extraTags) {
                        tags[k] = this.extraTags[k];
                    }

                    for (const point of timeSeries.points) {
                        switch (metric.descriptor.type) {
                            case MetricDescriptorType.CUMULATIVE_DOUBLE:
                            case MetricDescriptorType.GAUGE_DOUBLE:
                            case MetricDescriptorType.CUMULATIVE_INT64:
                            case MetricDescriptorType.GAUGE_INT64:
                                addMetric(metric.descriptor.name, point.timestamp, point.value as number, tags);
                                break;

                            case MetricDescriptorType.CUMULATIVE_DISTRIBUTION:
                            case MetricDescriptorType.GAUGE_DISTRIBUTION:
                                const distribution = point.value as DistributionValue
                                const dValues: { [key: string]: number } = {
                                    count: distribution.count,
                                    sum: distribution.sum,
                                    ss: distribution.sumOfSquaredDeviation,
                                    mean: distribution.count === 0 ? 0 : distribution.sum / distribution.count,
                                };

                                for (const k in dValues) {
                                    addMetric(metric.descriptor.name + "/" + k, point.timestamp, dValues[k], tags);
                                }

                                break;

                            case MetricDescriptorType.SUMMARY:
                                const summary = point.value as SummaryValue
                                const sValues: { [key: string]: number } = {
                                    count: summary.count,
                                    sum: summary.sum,
                                }

                                for (const k in sValues) {
                                    addMetric(metric.descriptor.name + "/" + k, point.timestamp, sValues[k], tags)
                                }

                                break

                            default:
                                this.logger.warn("unknown metric type: %s", metric.descriptor.type)
                        }
                    }
                }
            }
        }

        if (taggedMetrics.length > 0) {
            await this.sendTaggedMetrics(taggedMetrics);
        }
    }

    private async sendTaggedMetrics(taggedMetrics: TaggedMetric[]) {
        const metricsUrl = this.address + "/v1/data-receiver/metrics";
        const headers: {[key: string]: string} = {};
        if (this.apiKey) {
            headers[ZenossStatsExporter.DEFAULT_SOURCE_TYPE] = this.apiKey;
        }

        try {
            const response = await fetch(metricsUrl, {
                method: 'post',
                headers: headers,
                body: JSON.stringify({taggedMetrics}),
                timeout: this.period,
            });

            if (!response.ok) {
                const text = await response.text();
                this.logger.error(
                    "failed to send metrics: %s %s: %s",
                    response.status,
                    response.statusText,
                    text);
            } else {
                const json = await response.json();
                this.logger.debug("sent metrics:", json)
            }
        } catch (error) {
            this.logger.error("failed to send metrics: %s", error);
        }
    }

    stop(): void {
        clearInterval(this.timer);
    }

    // Deprecated by opencensus-node. Exists only to satisfy StatsEventListener interface.
    onRegisterView(view: View): void {}

    // Deprecated by opencensus-node. Exists only to satisfy StatsEventListener interface.
    onRecord(views: View[], measurement: Measurement, tags: Map<TagKey, TagValue>) {}
}

interface TaggedMetric {
    metric: string;
    timestamp: number;
    value: number;
    tags: { [k: string]: string };
}
