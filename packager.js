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

      - 选择填写套件备注（追加到文件名）

    检查已填信息

    生成升级套件

      - 生成完整版本信息

      - 生成完整升级套件

 */
const inquirer = require('inquirer');
const moment = require('moment');
const path = require('path');
const yaml = require('js-yaml');
const glob = require('glob');
const fs = require('fs-extra');
const crypto = require('crypto');
const archiver = require('archiver');

const config = require('./config.js');

function goBackChoice({ value = null, message = '(不选择, 返回上一级)' } = {}) {
    return {
        // 显示在列表的值
        name: message,
        // 传入 answer(selected) 对象的值
        value: value,
        // 选择后的显示值
        // short: message
    };
}

function compareVersions(a, b) {
    // 去掉先行版本号
    a = a.replace(/-.*$/, '').split('.');
    b = b.replace(/-.*$/, '').split('.');
    // 再比较
    let i = -1;
    while (i++ < 3) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return true;
}

function sameVersions(a, b) {
    // 去掉先行版本号
    a = a.replace(/-.*$/, '').split('.');
    b = b.replace(/-.*$/, '').split('.');
    // 再比较
    let i = -1;
    while (i++ < 3) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function isPreReleaseVersion(version) {
    return /-.*$/.test(version);
}

function getLatestVersions(versions, { versionKey = 'version', onlyPreRelease = false } = {}) {
    if (!versions) return [];
    if (versions.length === 1) return !onlyPreRelease || isPreReleaseVersion(versions[0]) ? versions : [];
    // 当前与之前比较，相等则取出并继续，不相等则停止并返回
    let i = versions.length;
    let result = !onlyPreRelease || isPreReleaseVersion(versions[i - 1]) ? [versions[i - 1]] : [];
    while (--i) {  // --i 则当 i === 1 时停止
        let [version, _version] = typeof versions[i] === 'string'
            ? [versions[i], versions[i - 1]]
            : [versions[i][versionKey], versions[i - 1][versionKey]];
        if (sameVersions(version, _version)) {
            if (!onlyPreRelease || isPreReleaseVersion(versions[i - 1])) result.push(versions[i - 1]);
        } else break;
    }
    return result;
}

function increaseVersion(version, type = 2, { retainPreRelease = false } = {}) {
    if (!version) throw new Error('version code is required');
    if (!Number.isInteger(type) || type < 0) throw new Error('version increase type should be integer');
    // 先行版本号
    let preReleaseCode = '';
    let versionCodes = version.replace(/-.*$/, match => {
        preReleaseCode = match;
        return '';
    }).split('.').map(s => Number(s));
    if (versionCodes.length !== 3) throw new Error(`'${version}' is not a standard version code`);
    // versionCodes[type]++;
    versionCodes = versionCodes.map((code, index) => index === type ? code + 1 : (index > type ? 0 : code));
    return `${versionCodes.join('.')}${retainPreRelease ? preReleaseCode : ''}`;
}

async function generateMD5(filename) {
    const hash = crypto.createHash('md5');
    const input = fs.createReadStream(filename);
    return await new Promise(resolve => {
        input.on('readable', () => {
            // Only one element is going to be produced by the
            // hash stream.
            const data = input.read();
            if (data)
                hash.update(data);
            else {
                resolve(hash.digest('hex'));
            }
        });
    });
}

function clearFlagFiles() {
    let flagFiles = glob.sync(path.join(__dirname, 'temp', `*_${process.pid}`));
    for (let flagFile of flagFiles) {
        fs.removeSync(flagFile);
        // process.stdout.write(`\n⚠️ 已清除标识文件 ${flagFile}`);
    }
}

function isExistedPid(pid, { exclude = [] } = {}) {
    if (Array.isArray(pid)) return pid.some((p) => isExistedPid(p, { exclude }));
    if (exclude.includes(pid)) return false;
    else {
        try {
            return process.kill(pid, 0);
        }
        catch (e) {
            return e.code === 'EPERM' || e.code !== 'ESRCH';
        }
    }
}

class Client {
    constructor() {
        // client ui
        // this.ui = new inquirer.ui.BottomBar();
        // 格式化 config，以默认值补足补全字段
        let { err } = this.formatConfig();
        if (err) this.error = err;
        this.selectedDeviceType = null;
        this.loadedDeviceTypeVersionInfo = null;
        this.selectedUpgradeFile = '';
        this.newVersion = '';
        this.versionDescription = '';
        this.selectedCompatibleVersions = [];
        this.selectedCompatibleModels = [];
        this.selectedCompatibleApps = [];
        this.pakcageFileRemarks = '';
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
            }],
            ['editVersionDescription', {
                curr: this.editVersionDescription
            }],
            ['selectCompatibleVersion', {
                curr: this.selectCompatibleVersion
            }],
            ['selectedCompatibleModels', {
                curr: this.selecteCompatibleModels
            }],
            ['selectedCompatibleApps', {
                curr: this.selecteCompatibleApps
            }],
            ['editPakcageFileRemarks', {
                curr: this.editPakcageFileRemarks
            }],
            ['confirmPreparedInfo', {
                curr: this.confirmPreparedInfo
            }],
            ['generatePackage', {
                curr: this.generatePackage
            }],
            ['clearFlagFiles', {
                curr: clearFlagFiles
            }],
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
        // 重新进入，如果当前已选择了设备类型，则需移除相应的标识文件
        if (this.selectedDeviceType) {
            fs.removeSync(path.join(__dirname, 'temp', `${this.selectedDeviceType.type}_${process.pid}`));
        }
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
                pageSize: 15
            }
        ]);
        if (device) {
            // 创建一个文件，名为 <设备类型>_<pid>
            let flagFile = path.join(__dirname, 'temp', `${device.type}_${process.pid}`);
            if (!fs.existsSync(flagFile)) await fs.outputFile(flagFile, '');
            // 判断是否存在一个以上文件，匹配 <设备类型>_*
            // 如果存在，则不允许操作，并提供重试选项
            let deviceTypeFlagFiles = glob.sync(path.join(__dirname, 'temp', `${device.type}_*`));
            if (deviceTypeFlagFiles.length > 1 
                && isExistedPid(deviceTypeFlagFiles.map(f => Number(f.replace(/^.+_/, ''))), { exclude: [process.pid] })) {
                console.log(`⚠️ ${device.title}升级文件正在被其它用户管理`);
                let { confirmExit } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'confirmExit',
                        message: '看是要:',
                        choices: [
                            goBackChoice({ message: '重试' }),
                            {
                                // 显示在列表的值
                                name: '退出',
                                // 传入 answer(selected) 对象的值
                                value: 1,
                                // 选择后的显示值
                                // short: message
                            }
                        ],
                        pageSize: 10
                    }
                ]);
                if (confirmExit) {
                    clearFlagFiles();
                    console.log(`\n⚠️ 再见`);
                    process.exit();
                }
                else return null;
            }
            console.log(`⚠️ 已选择设备类型: ${device.title}\n`);
        }
        this.selectedDeviceType = device;
        return device;
    }

    async loadDeviceTypeVersionInfo() {
        let deviceType = this.selectedDeviceType;
        let deviceTypeInfoFilepath = path.join(__dirname, 'packages', deviceType.type, 'info.yaml');
        let deviceTypeInfo;
        // 设备类型版本信息文件不存在则创建
        if (!fs.existsSync(deviceTypeInfoFilepath)) await fs.outputFile(deviceTypeInfoFilepath, '');
        // 载入设备类型版本信息 deviceTypeInfo
        deviceTypeInfo = yaml.safeLoad(fs.readFileSync(deviceTypeInfoFilepath, 'utf8'))
            ||
            {
                type: deviceType.type,
                packages: [
                    {
                        type: deviceType.type,
                        version: deviceType.initVersion,
                        date: moment(new Date()).format('YYYY-MM-DD-HH-mm-ss'),
                        description: '',
                        updatedAt: null,
                        versions: [],
                        models: [],
                        apps: [],
                        fileName: '',
                        fileSize: 0,
                        md5: '',
                    }
                ],
            };
        this.loadedDeviceTypeVersionInfo = deviceTypeInfo;
        return deviceTypeInfo;
    }
    async showCurrentVersion() {
        let deviceType = this.selectedDeviceType;
        let deviceTypeInfo = await this.loadDeviceTypeVersionInfo(deviceType);
        // 若设备类型版本信息 deviceTypeInfo 还不存在，则从指定的初始版本 initVersion 开始创建版本
        console.log(`⚠️ ${deviceType.title}当前版本：${deviceTypeInfo.packages.slice(-1)[0].version}\n`);
    }

    async selectUpgradeFile() {
        let deviceType = this.selectedDeviceType;
        let fileDirectoryPath = path.join(__dirname, 'packages', deviceType.type, 'raw');
        let fileChoices = glob.sync(`${fileDirectoryPath}/*`).map(fp => path.basename(fp));
        if (!fileChoices.length) {
            console.log('⚠️ 没有任何升级文件可供选择\n');
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
        if (filename) console.log(`⚠️ 已选择升级文件: ${filename}\n`);
        this.selectedUpgradeFile = path.join(fileDirectoryPath, filename);
    }

    async selectVersionType() {
        let deviceType = this.selectedDeviceType;
        let currVersion = this.loadedDeviceTypeVersionInfo.packages.slice(-1)[0].version;
        let { versionType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'versionType',
                message: '选择升级版本类型:',
                choices: [
                    { name: '主版本', value: { title: '主版本', typeCode: 0 } },
                    { name: '次版本', value: { title: '次版本', typeCode: 1 } },
                    { name: '修订版本', value: { title: '修订版本', typeCode: 2 } },
                    ...(currVersion === '0.0.0' ? [] : [{ name: '先行版本', value: { title: '先行版本', typeCode: 'pre-release' } }]),
                    goBackChoice(),
                ],
                pageSize: 10
            }
        ]);
        if (versionType === null) return null;
        if (versionType) console.log(`⚠️ 已选择升级版本类型: ${versionType.title}\n`);
        let newVersion;
        let refPreReleaseCode;
        if (versionType.typeCode === 'pre-release') {
            // 如果发布的是先行版本，则列出最新 主.次.修 版本的最近几个 -先行版本 供查看
            let latestVersions = getLatestVersions(this.loadedDeviceTypeVersionInfo.packages, { onlyPreRelease: true })
                .map(v => {
                    let oneLineDescription = v.description.replace(/\n.*/g, '');
                    let description = oneLineDescription
                        ? `${oneLineDescription.slice(0, 30)}${v.description.length > 30 ? '...' : ''}`
                        : '(无描述)';
                    return {
                        // 显示在列表的值
                        name: `版本号: ${v.version}; 发布时间: ${v.date}; 描述: ${description}`,
                        // 传入 answer(selected) 对象的值
                        value: v,
                        // 选择后的显示值
                        short: v.version,
                    };
                });
            if (latestVersions.length) {
                let { refPreRelease } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'refPreRelease',
                        message: '⚠️ 以下是当前最新版本已有的先行版本: (回车继续)',
                        choices: [goBackChoice({ message: '(不继续，返回上一级)' })].concat(latestVersions),
                        default: 1,
                        pageSize: 10
                    }
                ]);
                if (refPreRelease === null) return null;
                refPreReleaseCode = refPreRelease.version.replace(/[^-]*-*/, '');
            }
            else {
                console.log('⚠️ 当前最新版本暂时还没有任何先行版本');
            }
        }
        else {
            newVersion = increaseVersion(currVersion, versionType.typeCode);
        }
        let { preReleaseCode } = await inquirer.prompt([
            {
                type: 'input',
                name: 'preReleaseCode',
                message: '输入先行版本号: (若无需则回车跳过)',
                default: refPreReleaseCode || undefined,
                validate: function (value) {
                    return !value || /^\b[\-_a-zA-Z0-9]+\b$/.test(value) || '⚠️ 先行版本号应为字母、数字、中划线、下划线的任意组合';
                }
            }
        ]);
        newVersion = preReleaseCode ? `${currVersion}-`.replace(/-.*$/, `-${preReleaseCode}`) : newVersion;
        let { needReselect } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needReselect',
                message: '确认:',
                choices: [
                    { name: `新版本号${newVersion}`, value: 0 },
                    { name: `不对，我要重来`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needReselect === null) return null;
        if (needReselect) return await this.selectVersionType(deviceType);
        if (newVersion) console.log(`⚠️ 已确认新版本号: ${newVersion}\n`);
        this.newVersion = newVersion;
        return newVersion;
    }

    async editVersionDescription() {
        this.versionDescription = '';
        let { needDescription } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needDescription',
                message: '是否需要填写版本描述:',
                choices: [
                    { name: `不用了`, value: 0 },
                    { name: `需要`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needDescription === null) return null;
        if (needDescription) {
            let { description } = await inquirer.prompt([
                {
                    type: 'editor',
                    name: 'description',
                    message: '填写版本描述:',
                }
            ]);
            this.versionDescription = description;
            return description;
        }
    }

    async selectCompatibleVersion() {
        this.selectedCompatibleVersions = [];
        let { needSelect } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needSelect',
                message: '是否需要指定兼容版本:',
                choices: [
                    { name: `不用了`, value: 0 },
                    { name: `需要`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needSelect === null) return null;
        let versions = [];
        if (needSelect) {
            ({ versions } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'versions',
                    message: '选择兼容版本:',
                    choices: [
                        ...this.loadedDeviceTypeVersionInfo.packages.map(p => p.version),
                        goBackChoice(),
                    ],
                    pageSize: 10
                }
            ]));
            if (versions.includes(null)) return null;
        }
        this.selectedCompatibleVersions = versions;
        return versions;
    }

    async selecteCompatibleModels() {
        this.selectedCompatibleModels = [];
        let { needSelect } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needSelect',
                message: '是否需要指定兼容型号:',
                choices: [
                    { name: `不用了`, value: 0 },
                    { name: `需要`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needSelect === null) return null;
        let models = [];
        if (needSelect) {
            ({ models } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'models',
                    message: '选择兼容型号:',
                    choices: [
                        goBackChoice(),
                        ...Object.keys(config.devices[this.selectedDeviceType.type].models)
                    ],
                    pageSize: 10
                }
            ]));
            if (models.includes(null)) return null;
        }
        this.selectedCompatibleModels = models;
        return models;
    }

    async selecteCompatibleApps() {
        this.selectedCompatibleApps = [];
        let { needSelect } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needSelect',
                message: '是否需要指定兼容应用:',
                choices: [
                    { name: `不用了`, value: 0 },
                    { name: `需要`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needSelect === null) return null;
        let apps = [];
        if (needSelect) {
            ({ apps } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'apps',
                    message: '选择兼容应用:',
                    choices: [
                        goBackChoice(),
                        ...Object.keys(config.apps)
                    ],
                    pageSize: 10
                }
            ]));
            if (apps.includes(null)) return null;
        }
        this.selectedCompatibleApps = apps;
        return apps;
    }

    async editPakcageFileRemarks() {
        this.pakcageFileRemarks = '';
        let { needRemarks } = await inquirer.prompt([
            {
                type: 'list',
                name: 'needRemarks',
                message: '是否需要追加文件备注:',
                choices: [
                    { name: `不用了`, value: 0 },
                    { name: `需要`, value: 1 },
                    goBackChoice()
                ],
                pageSize: 10
            }
        ]);
        if (needRemarks === null) return null;
        if (needRemarks) {
            let { remarks } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'remarks',
                    message: '追加文件备注:',
                }
            ]);
            this.pakcageFileRemarks = remarks;
            return remarks;
        }
    }

    async confirmPreparedInfo() {
        console.log(`
⚠️ 设备类型: ${this.selectedDeviceType.title}
——————————————————————
⚠️ 升级文件: ${path.join(__dirname, this.selectedUpgradeFile)}
——————————————————————
⚠️ 新版本号: ${this.newVersion}
——————————————————————
⚠️ 版本描述: \n${this.versionDescription || '(无)'}
——————————————————————
⚠️ 兼容版本: \n${this.selectedCompatibleVersions.length ? this.selectedCompatibleVersions : '(所有版本)' }
——————————————————————
⚠️ 兼容型号: \n${this.selectedCompatibleModels.length ? this.selectedCompatibleModels : '(所有型号)' }
——————————————————————
⚠️ 兼容应用: \n${this.selectedCompatibleApps.length ? this.selectedCompatibleApps : '(所有应用)' }
——————————————————————
⚠️ 套件备注: \n${this.pakcageFileRemarks || '(无)'}
        `);
        let { confirm } = await inquirer.prompt([
            {
                type: 'list',
                name: 'confirm',
                message: '确定以上版本信息无误 ?',
                choices: [
                    { name: `确定`, value: true },
                    { name: `返回`, value: null },
                ],
                pageSize: 10
            }
        ]);
        return confirm;
    }

    async generatePackage() {
        let ui = new inquirer.ui.BottomBar();
        ui.updateBottomBar('⚠️ 正在生成版本描述文件 ...');

        let packageDate = moment(new Date()).format('YYYY-MM-DD-HH-mm-ss');
        let packageDir = path.join(__dirname, 'packages', this.selectedDeviceType.type);
        let name = `${this.selectedDeviceType.type}_${this.newVersion}_${packageDate}${this.pakcageFileRemarks ? `_${this.pakcageFileRemarks}` : ''}`;
        let fileName = `${name}${path.extname(this.selectedUpgradeFile)}`;
        // let fileName = `${this.selectedDeviceType.type}_${this.newVersion}_${packageDate}_${this.pakcageFileRemarks}.zip`;  // old
        let packageName = path.join(packageDir, `${name}.zip`);

        // 版本信息写入描述文件
        let packageInfoTempFile = path.join(packageDir, 'info.temp.json');
        let packageInfo = {
            type: this.selectedDeviceType.type,
            version: this.newVersion,
            date: packageDate,
            description: this.versionDescription,
            updatedAt: null,
            versions: this.selectedCompatibleVersions,
            models: this.selectedCompatibleModels,
            apps: this.selectedCompatibleApps,
            fileName: fileName,
            fileSize: fs.statSync(this.selectedUpgradeFile).size,
            md5: await generateMD5(this.selectedUpgradeFile),
            remarks: this.pakcageFileRemarks
        };
        await fs.outputJson(packageInfoTempFile, packageInfo);

        ui.updateBottomBar('⚠️ 正在生成压缩升级套件 ...');

        // 生成 zip 压缩包
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(packageName);
            const archive = archiver('zip');

            output.on('close', function () {
                resolve();
            });

            archive.on('error', function (err) {
                reject(err);
            });

            archive.pipe(output);

            archive
                .append(fs.createReadStream(packageInfoTempFile), { name: 'info.json' })
                .append(fs.createReadStream(this.selectedUpgradeFile), { name: fileName })
                // .append(fs.createReadStream(this.selectedUpgradeFile), { name: path.basename(this.selectedUpgradeFile) })  // old
                .finalize();
        });

        ui.updateBottomBar('⚠️ 正在写入新版本信息 ...');

        // 向版本数据库写入新版本信息
        let infoFile = path.join(packageDir, 'info.yaml');
        this.loadedDeviceTypeVersionInfo.packages.push(packageInfo);
        fs.writeFileSync(infoFile, yaml.safeDump(this.loadedDeviceTypeVersionInfo));

        ui.updateBottomBar(`⚠️ 已生成升级套件位置: ${packageName}\n`);
        ui.close();
    }
}

// This will not work with inquirer.js
// // so the program will not close instantly
// process.stdin.resume();
// // catches ctrl+c event
// process.on('SIGINT', onExit);
// // catches uncaught exceptions
// process.on('uncaughtException', onExit);

process.stdin.on("data", (key) => {
    if (key == "\u0003") {
        clearFlagFiles();
        console.log(`\n⚠️ 再见`);
        process.exit();
    }
});

(async () => {
    // ┌ ┐ └ ┘ ├ ┤ ┬ ┴
    // const ui = new inquirer.ui.BottomBar();
    const client = new Client();
    try {
        await client.start();
    } catch (e) {
        console.error(`版本管理器错误：${e.stack}`);
    }
    // ui.updateBottomBar('\n');
    // ui.close();
})();


