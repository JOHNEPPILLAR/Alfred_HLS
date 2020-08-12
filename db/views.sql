CREATE OR REPLACE VIEW vw_battery_data AS
SELECT last("time", "time") AS "time", last(batteryLevel, "time") AS battery, deviceName || ' camera' as location, deviceID AS device
FROM camera
--WHERE time > NOW() - interval '1 hour' 
GROUP BY deviceID, deviceName