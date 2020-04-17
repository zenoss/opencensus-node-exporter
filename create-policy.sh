#!/usr/bin/env bash

export ZENOSS_ADDRESS="https://api.zenoss.io"
export ZENOSS_API_KEY="YOUR-ZENOSS-API-KEY"

zenoss-api-post () {
  echo "POST $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X POST -d @-
}

zenoss-api-put () {
  echo "PUT $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X PUT -d @-
}

zenoss-api-delete () {
  echo "DELETE $1"
  curl "$ZENOSS_ADDRESS$1" \
    -H "zenoss-api-key: $ZENOSS_API_KEY" \
    -k -s -X DELETE
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
