const exposes = require('zigbee-herdsman-converters/lib/exposes');
const fz = {...require('zigbee-herdsman-converters/converters/fromZigbee'), legacy: require('zigbee-herdsman-converters/lib/legacy').fromZigbee};
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
//const globalStore = require('../lib/store');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
//const extend = require('../lib/extend');
//const {extendDevice} = require('../lib/utils');
//const e = exposes.presets;
const ea = exposes.access;


const utils = require('zigbee-herdsman-converters/lib/utils');
const constants = require('zigbee-herdsman-converters/lib/constants');
const legacy = require('zigbee-herdsman-converters/lib/legacy');
const c = {
    hive_thermostat_system_mode: {
        key: ['system_mode'],
        convertSet: async (entity, key, value, meta) => {
            let systemMode = utils.getKey(constants.thermostatSystemModes, value, undefined, Number);
            if (systemMode === undefined) {
                systemMode = utils.getKey(legacy.thermostatSystemModes, value, value, Number);
            }
            switch (value) {
                case 'off':
                    // Send a message that matches what the thermostat remote control sends
                    await entity.write('hvacThermostat', {
                        tempSetpointHold: 0,
                        tempSetpointHoldDuration: 0,
                        systemMode
                    });
                case 'heat':
                    occupiedHeatingSetpoint = 2000; // 20.00°C - When selecting manual (heat), the hive always selects this temperature.
                    // Send a message that matches what the thermostat remote control sends
                    await entity.write('hvacThermostat', {
                        occupiedHeatingSetpoint,
                        tempSetpointHold: 1,
                        tempSetpointHoldDuration: 65535, // The thermostat will set this anyway, saves a message if we do it here (?)
                        systemMode
                    });
                    return { readAfterWriteTime: 250, state: { system_mode: value, occupied_heating_setpoint: occupiedHeatingSetpoint / 100 } };
                case 'emergency_heating':
                    occupiedHeatingSetpoint = 2000; // Default hive temperature
                    await entity.write('hvacThermostat', {
                        occupiedHeatingSetpoint,
                        tempSetpointHold: 1,
                        tempSetpointHoldDuration: 30, // Minimum duration of 30 mins. Values below 30 are set to 30 by the thermostat.
                        systemMode
                    });
                    return {readAfterWriteTime: 250, state: {system_mode: value, occupied_heating_setpoint: occupiedHeatingSetpoint/100}}
                // TBD: emergency_heating, auto (scheduled)
                default:
                    // No special message needed, just send systemMode.
                    await entity.write('hvacThermostat', { systemMode });
                    return { readAfterWriteTime: 250, state: { system_mode: value } };
            }
        },
        convertGet: async (entity, key, meta) => {
            await entity.read('hvacThermostat', ['systemMode']);
        },
    }
}

module.exports = [
    {
        zigbeeModel: ['SLR1c'],
        model: 'SLR1c',
        vendor: 'Hive',
        description: 'Heating thermostat',
        fromZigbee: [fz.thermostat, fz.thermostat_weekly_schedule],
        toZigbee: [tz.thermostat_local_temperature, c.hive_thermostat_system_mode, tz.thermostat_running_state,
            tz.thermostat_occupied_heating_setpoint, tz.thermostat_control_sequence_of_operation, tz.thermostat_weekly_schedule,
            tz.thermostat_clear_weekly_schedule, tz.thermostat_temperature_setpoint_hold, tz.thermostat_temperature_setpoint_hold_duration],
        exposes: [
            exposes.climate().withSetpoint('occupied_heating_setpoint', 5, 32, 0.5).withLocalTemperature()
                .withSystemMode(['off', 'auto', 'heat', 'emergency_heating']).withRunningState(['idle', 'heat']),
            exposes.binary('temperature_setpoint_hold', ea.ALL, true, false)
                .withDescription('Prevent changes. `false` = run normally. `true` = prevent from making changes.' +
                    ' Must be set to `false` when system_mode = off or `true` for heat'),
            exposes.numeric('temperature_setpoint_hold_duration', ea.ALL).withValueMin(0).withValueMax(65535)
                .withDescription('Period in minutes for which the setpoint hold will be active. 65535 = attribute not' +
                    ' used. 0 to 360 to match the remote display')],
        meta: {disableDefaultResponse: true},
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(5);
            const binds = ['genBasic', 'genIdentify', 'genAlarms', 'genTime', 'hvacThermostat'];
            await reporting.bind(endpoint, coordinatorEndpoint, binds);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatRunningState(endpoint);
            await reporting.thermostatSystemMode(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint);
            await reporting.thermostatTemperatureSetpointHold(endpoint);
            await reporting.thermostatTemperatureSetpointHoldDuration(endpoint);
        },
    }
];
