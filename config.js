module.exports = {
    apps: {
        hispro: {}
    },
    devices: {
        sickbedhost: {
            type: 'sickbedhost',
            title: '通用病床分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        x1h_7inch_sickbedhost: {
            type: 'x1h_7inch_sickbedhost',
            title: 'X1H 7 寸病床分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        nx1_7inch_sickbedhost: {
            type: 'nx1_7inch_sickbedhost',
            title: 'NX1 7 寸病床分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        'x1h_4.3inch_sickbedhost': {
            type: 'x1h_4.3inch_sickbedhost',
            title: 'X1H 4.3 寸病床分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        'nx1_4.3inch_sickbedhost': {
            type: 'nx1_4.3inch_sickbedhost',
            title: 'NX1 4.3 寸病床分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        
        nshost: {
            type: 'nshost',
            title: '通用护士站主机',
            models: {},
        },
        android_nshost: {
            type: 'android_nshost',
            title: '安卓护士站主机',
            models: {},
        },
        x1h_nshost: {
            type: 'x1h_nshost',
            title: 'X1H 护士站主机',
            models: {},
        },
        nx1_nshost: {
            type: 'nx1_nshost',
            title: 'NX1 护士站主机',
            models: {},
        },

        sickroomhost: {
            type: 'sickroomhost',
            title: '通用病房门口机',
            disabled: false,
            initVersion: '0.0.0',
        },
        android_sickroomhost: {
            type: 'android_sickroomhost',
            title: '安卓病房门口机',
            disabled: false,
            initVersion: '0.0.0',
        },
        x1h_10inch_sickroomhost: {
            type: 'x1h_10inch_sickroomhost',
            title: 'X1H 10寸 病房门口机',
            disabled: false,
            initVersion: '0.0.0',
        },
        nx1_10inch_sickroomhost: {
            type: 'nx1_10inch_sickroomhost',
            title: 'NX1 10寸 病房门口机',
            disabled: false,
            initVersion: '0.0.0',
        },
    }
};
