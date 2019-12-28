module.exports = {
    apps: {
        hispro: {}
    },
    devices: {
        sickbedhost: {
            type: 'sickbedhost',
            title: '床旁分机',
            models: {
                x3: {},
                x7: {},
            },
        },
        nshost: {
            type: 'nshost',
            title: '护士站主机',
            models: {},
        },
        sickroomhost: {
            type: 'sickroomhost',
            title: '房门口机',
            disabled: false,
            initVersion: '0.0.0',
        }
    }
};
