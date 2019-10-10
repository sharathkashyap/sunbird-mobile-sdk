global.cordova = {
    plugin: {
        http: {
            setDataSerializer: () => {},
            setHeader: () => {},
            get: () => {},
            post: () => {},
            put: () => {},
            patch: () => {},
        }
    },
    plugins: {
        notification: {
            local: {
                lanchDetails: {},
                getScheduledIds: () => {
                },
                schedule: () => {
                }
            }
        },
        diagnostic: {
            switchToSettings: () => {
            }
        }
    },
    file: {
        applicationDirectory: '/path'
    },
    InAppBrowser: {
        open: () => ({
            addEventListener: () => {},
        }),
    }
};

global.supportfile = {
    shareSunbirdConfigurations: () => {
    }
}

global.buildconfigreader = {
    getMetaData: () => {
        
    },
    copyFile: () => {

    },
    createDirectories: () => {
        
    }
}
