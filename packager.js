/*

    选择设备类型

    提示当前版本

    选择升级文件

    填写版本信息

      - 选择升级的版本类型（主版本、次版本、修订版本）

      - 选择填写先行版本号

      - 选择填写版本描述

      - 选择填写兼容型号（从列表中选取）

      - 选择填写兼容版本（从列表中选取）

      - 选择填写兼容应用（从列表中选取）

    生成升级套件

      - 生成完整版本信息

      - 生成完整升级套件

 */
const inquirer = require('inquirer');
const path = require('path');
const yaml = require('js-yaml');
const glob = require('glob');
const fs = require('fs-extra');

const config = require('./config.js');

function goBackChoice({ value = null } = {}) {
    return {
        // 显示在列表的值
        name: '(不选择, 返回上一级)',
        // 传入 answer(selected) 对象的值
        value: value,
        // 选择后的显示值
        short: '(不选择, 返回上一级)'
    };
}

function increaseVersion(version, type = 2) {
    if (!version) throw new Error('version code is required');
    if (!Number.isInteger(type) || type < 0) throw new Error('version increase type should be integer');
    // 先行版本号
    let preReleaseCode = '';
    let versionCodes = version.replace(/-.*$/, match => {
        preReleaseCode = match;
        return '';
    }).split('.').map(s => Number(s));
    if (versionCodes.length !== 3) throw new Error(`'${version}' is not a standard version code`);
    versionCodes[type]++;
    return `${versionCodes.join('.')}${preReleaseCode}`;
}

class Client {
    constructor() {
        // client ui
        this.ui = new inquirer.ui.BottomBar();
        // 格式化 config，以默认值补足补全字段
        let { err } = this.formatConfig();
        if (err) this.error = err;
        this.selectedDeviceType = null;
        this.loadedDeviceTypeVersionInfo = null;
        this.selectedUpgradeFile = null;
        this.newVersion = null;
    }

    formatConfig({ check = true } = {}) {
        let devices = config.devices;
        for (let type in devices) {
            let device = devices[type];
            if (!device.type) return { err: new Error(`设备类型${device.title}不允许为空`) };
            devices[type] = Object.assign({
                disabled: false,
                initVersion: '0.0.0',
                title: device.type,
                models: {},
            }, device);
        }
        return { err: null };
    }

    async start() {
        if (this.error) throw this.error;
        await this.takeSteps([  // 可切入参数转换器
            ['selectType', {
                curr: this.selectType
            }],
            ['showCurrentVersion', {
                curr: this.showCurrentVersion
            }],
            ['selectUpgradeFile', {
                prev: 'selectType',
                curr: this.selectUpgradeFile
            }],
            ['selectVersionType', {
                curr: this.selectVersionType
            }]
        ]);
    }

    async takeSteps(steps = []) {
        let i = 0, result;
        while(i < steps.length) {
            let step = steps[i][1];

            // 如果 step.curr 是一个数组，则为子步骤
            let _result = Array.isArray(step.curr) ?
                await this.takeSteps(step.curr)
                : await step.curr.call(this, result);

            if (_result === null) {
                // 若结果为 null 则返回上一级
                let prevStepIndex = step.prev ? steps.findIndex(_step => _step[0] === step.prev) : -1;
                // 没有找到 prevStepIndex 就直接退一步，否则退到 prevStepIndex
                i = Math.max(0, prevStepIndex === -1 ? (i - 1) : prevStepIndex);
            }
            else {
                // 若结果为 undefined 则继续传递上一步结果
                result = _result === undefined ? result : _result;
                i++;
            }
        }
    }

    async selectType() {
        let devices = config.devices;
        let deviceChoices = [];
        for (let type in devices) {
            let device = devices[type];
            deviceChoices.push({
                // 显示在列表的值
                name: `${device.title}(${device.type})`,
                // 传入 answer(selected) 对象的值
                value: device,
                // 选择后的显示值
                short: device.title,
                disabled: device.disabled && '停用'
            });
        }
        deviceChoices.push(goBackChoice());
        let { device } = await inquirer.prompt([
            {
                type: 'list',
                name: 'device',
                message: '选择设备类型:',
                choices: deviceChoices,
                pageSize: 10
            }
        ]);
        if (device) this.ui.updateBottomBar(`已选择设备类型: ${device.title}\n`);
        this.selectedDeviceType = device;
        return device;
    }

    async loadDeviceTypeVersionInfo(deviceType = {}) {
        let deviceTypeInfoFilepath = path.join(__dirname, 'packages', deviceType.type, 'info.yaml');
        let deviceTypeInfo;
        // 设备类型版本信息文件不存在则创建
        if (!fs.existsSync(deviceTypeInfoFilepath)) await fs.outputFile(deviceTypeInfoFilepath, '');
        // 载入设备类型版本信息 deviceTypeInfo
        deviceTypeInfo = yaml.safeLoad(fs.readFileSync(deviceTypeInfoFilepath, 'utf8'))
            || { type: deviceType.type, packages: [ { version: deviceType.initVersion } ] };
        this.loadedDeviceTypeVersionInfo = deviceTypeInfo;
        return deviceTypeInfo;
    }
    async showCurrentVersion(deviceType = {}) {
        let deviceTypeInfo = this.loadedDeviceTypeVersionInfo || await this.loadDeviceTypeVersionInfo(deviceType);
        // 若设备类型版本信息 deviceTypeInfo 还不存在，则从指定的初始版本 initVersion 开始创建版本
        this.ui.updateBottomBar(`${deviceType.title}当前版本：${deviceTypeInfo.packages.slice(-1).version}\n`);
    }

    async selectUpgradeFile(deviceType) {
        let fileDirectoryPath = path.join(__dirname, 'packages', deviceType.type, 'raw');
        let fileChoices = glob.sync(`${fileDirectoryPath}/*`).map(fp => path.basename(fp));
        if (!fileChoices.length) {
            this.ui.updateBottomBar('⚠️没有任何升级文件可供选择\n');
            return null;
        }
        let { filename } = await inquirer.prompt([
            {
                type: 'list',
                name: 'filename',
                message: '选择升级文件:',
                choices: fileChoices.concat(goBackChoice()),
                pageSize: 10
            }
        ]);
        if (filename === null) return null;
        if (filename) this.ui.updateBottomBar(`已选择升级文件: ${filename}\n`);
        this.selectedUpgradeFile = path.join(fileDirectoryPath, filename);
    }

    async selectVersionType(deviceType) {
        let { versionType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'versionType',
                message: '选择升级版本类型:',
                choices: [
                    { name: '主版本', value: 0 },
                    { name: '次版本', value: 1 },
                    { name: '修订版本', value: 2 },
                    goBackChoice(),
                ],
                pageSize: 10
            }
        ]);
        if (versionType === null) return null;
        let newVersion = increaseVersion(this.loadedDeviceTypeVersionInfo.packages.slice(-1)[0].version, versionType);
        let { needRelect } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needRelect',
                message: '确认:',
                choices: [
                    { name: `新版本号${newVersion}`, value: 0 },
                    { name: `不对，我要重来`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needRelect === null) return null;
        if (needRelect) return await this.selectVersionType(deviceType);
        if (newVersion) this.ui.updateBottomBar(`已确认新版本号: ${newVersion}\n`);
        this.newVersion = newVersion;
        return newVersion;
    }

    async selectApps() {

    }

    async selectModel() {

    }

    async generatePackage() {

    }
}

(async () => {
    // ┌ ┐ └ ┘ ├ ┤ ┬ ┴
    console.log(`
    ┌———————————————————————————————————————————————┐
    |                                               |
    |  欢迎使用 Voerka 设备升级套件管理系统 V1.0.0  |
    |                                               |
    └———————————————————————————————————————————————┘
    `);
    const ui = new inquirer.ui.BottomBar();
    const client = new Client();
    try {
        await client.start();
    } catch (e) {
        console.error(`版本管理器错误：${e.stack}`);
    }
    // ui.updateBottomBar('\n');
    ui.close();
})();


