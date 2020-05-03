CREATE TABLE camera (
  time                      TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  deviceID                  TEXT              NOT NULL,
  deviceName                TEXT              NOT NULL,
  signalStrength            INT               NOT NULL,
  batteryLevel              INT               NOT NULL
)

SELECT create_hypertable('camera', 'time')