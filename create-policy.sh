#!/usr/bin/env bash
#
# This script provides an example of creating (and deleting) Zenoss policy
# to handle the tagged metrics sent by @zenoss/opencensus-node-exporter.
#
# The policy assumes you have set the "source" option of your exporter, and
# that all of your metrics are tagged with an "app" tag, or you're adding the
# "app" tag via the exporter's "extraTags" option.
#
# This will result in an entity being created that represents the source/app
# combination, and metrics being attributed to that entity.
#
# ZENOSS_ADDRESS can be overridden, but defaults to https://api.zenoss.io
#
# You must set the ZENOSS_API_KEY environment variable.

ZENOSS_ADDRESS="${ZENOSS_ADDRESS:-https://api.zenoss.io}"

if [ -z "$ZENOSS_API_KEY" ]; then
    echo "ZENOSS_API_KEY must be set."
    exit 1
fi

# Create API helper functions.
zenoss-api-post () {
  echo "POST $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X POST -d @-
  echo
}

zenoss-api-put () {
  echo "PUT $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X PUT -d @-
  echo
}

zenoss-api-delete () {
  echo "DELETE $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X DELETE
  echo
}

# Delete policies if first argument is -d.
if [ "$1" == "-d" ]; then
    zenoss-api-delete /v1/policy/custom/datasources/opencensus-node-exporter
    zenoss-api-delete /v1/policy/custom/ingests/metricIngest_opencensus
    zenoss-api-delete /v1/policy/custom/ingests/modelIngest_opencensus
    exit 0
fi

# Create metric ingest policy.
zenoss-api-post /v1/policy/custom/ingests << EOF
{
    "name": "metricIngest_opencensus",
    "requiredKeys": ["source", "source-type", "app"],
    "dimensionKeys": ["source", "app"],
    "metadataKeys": ["source-type"],
    "useAllKeysAsDims": false,
    "excludeInternalFromAllKeysAsDims": true,
    "generateEntityId": true,
    "entityDimensionKeys": ["source", "app"],
    "contributeModelInfo": true
}
EOF

# Create model ingest policy.
zenoss-api-post /v1/policy/custom/ingests << EOF
{
    "name": "modelIngest_opencensus",
    "requiredKeys": ["source", "source-type", "app"],
    "fieldTransforms": [
        {
            "operation": "COPY",
            "sourceKey": "source",
            "targetKey": "name"
        }
    ],
    "dimensionKeys": ["source", "app"],
    "metadataKeys": ["source-type", "name"],
    "useAllKeysAsDims": false,
    "excludeInternalFromAllKeysAsDims": true,
    "generateEntityId": true,
    "entityDimensionKeys": ["source", "app"]
}
EOF

# Create datasource that uses the metric and model ingest policies.
zenoss-api-post /v1/policy/custom/datasources << EOF
{
    "name": "opencensus-node-exporter",
    "sourceType": "zenoss/opencensus-node-exporter",
    "policyReferences": [
        {
            "dataType": 2,
            "policyType": 2,
            "policyName": "metricIngest_opencensus"
        },
        {
            "dataType": 3,
            "policyType": 2,
            "policyName": "modelIngest_opencensus"
        }
    ]
}
EOF
