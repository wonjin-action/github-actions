import * as cdk from 'aws-cdk-lib';
import { BLEAVpcStack } from '../lib/blea-vpc-stack';
import { BLEAKeyAppStack } from '../lib/blea-key-app-stack';
import { BLEADbAuroraPgStack } from '../lib/blea-db-aurora-pg-stack';
import { BLEAMonitorAlarmStack } from '../lib/blea-monitor-alarm-stack';
import { BLEAChatbotStack } from '../lib/blea-chatbot-stack';
import { BLEAWafStack } from '../lib/blea-waf-stack';
// import { BLEACanaryStack } from "../lib/blea-canary-stack";
import { ElastiCacheRedisStack } from '../lib/mynv-elasticache-redis-stack';
import * as fs from 'fs';
import { IConfig } from '../params/interface';
import { MynvStepFunctionsSampleStack } from '../lib/mynv-stepfunctions-sample-stack';
import { MynvOpenSearchStack } from '../lib/mynv-opensearch-stack';
import { MynvBackupVaultStack } from '../lib/mynv-backup-vault-stack';
import { MynvBackupPlanStack } from '../lib/mynv-backup-plan-stack';
//OpenSearchSererless使用の場合以下をコメントイン、import { MynvOpenSearchStack } from '../lib/mynv-opensearch-stack';をコメントアウト
//import {MynvOpenSearchServerlessStack} from '../lib/mynv-opensearchserverless-stack';
import { BLEADashboardStack } from '../lib/blea-dashboard-stack';
import { MynvEcsStack } from '../lib/mynv-ecs-stack';
import { Ec2Action } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { MynvOidcStack } from '../lib/mynv-oidc-stack';
// cognito使用の場合以下をコメントイン
//import { MynvCognitoStack } from '../lib/mynv-cognito-stack';
import { MynvInfraResourcesPipelineStack } from '../lib/mynv-pipeline-infraresources-stack';

const app = new cdk.App();

// ----------------------- Load context variables ------------------------------
// This context need to be specified in args
const argContext = 'environment';
const envKey = app.node.tryGetContext(argContext);
if (envKey == undefined)
  throw new Error(`Please specify environment with context option. ex) cdk deploy -c ${argContext}=dev`);
//Read Typescript Environment file
const TsEnvPath = './params/' + envKey + '.ts';
if (!fs.existsSync(TsEnvPath)) throw new Error(`Can't find a ts environment file [../params/` + envKey + `.ts]`);

//ESLintではrequireの利用が禁止されているため除外コメントを追加
//https://github.com/mynavi-group/csys-infra-baseline-environment-on-aws-change-homemade/issues/29#issuecomment-1437738803
const config: IConfig = require('../params/' + envKey);

// Add envName to Stack for avoiding duplication of Stack names.
const pjPrefix = config.Env.envName + 'BLEA';

// ----------------------- Environment variables for stack ------------------------------
// Default environment
const procEnvDefault = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Define account id and region from context.
// If "env" isn't defined on the environment variable in context, use account and region specified by "--profile".
function getProcEnv() {
  if (config.Env.account && config.Env.region) {
    return {
      account: config.Env.account,
      region: config.Env.region,
    };
  } else {
    return procEnvDefault;
  }
}

// ----------------------- Guest System Stacks ------------------------------

// Slack Notifier
const workspaceId = config.NotifierParam.workspaceId;
const channelIdMon = config.NotifierParam.channelIdMon;

// Topic for monitoring guest system
const monitorAlarm = new BLEAMonitorAlarmStack(app, `${pjPrefix}-MonitorAlarm`, {
  notifyEmail: config.NotifierParam.monitoringNotifyEmail,
  env: getProcEnv(),
});

new BLEAChatbotStack(app, `${pjPrefix}-ChatbotMonitor`, {
  topicArn: monitorAlarm.alarmTopic.topicArn,
  workspaceId: workspaceId,
  channelId: channelIdMon,
  env: getProcEnv(),
});

// InfraResources
new MynvInfraResourcesPipelineStack(app, `${pjPrefix}-Pipeline`, {
  ...config.InfraResourcesPipelineParam,
  env: envKey,
});

// CMK for Apps
const appKey = new BLEAKeyAppStack(app, `${pjPrefix}-AppKey`, {
  env: getProcEnv(),
});

// Networking
const myVpcCidr = config.VpcParam.cidr;
const myVpcMaxAzs = config.VpcParam.maxAzs;
const prodVpc = new BLEAVpcStack(app, `${pjPrefix}-Vpc`, {
  myVpcCidr: myVpcCidr,
  myVpcMaxAzs: myVpcMaxAzs,
  env: getProcEnv(),
});

const waf = new BLEAWafStack(app, `${pjPrefix}-Waf`, {
  scope: 'CLOUDFRONT',
  env: {
    account: getProcEnv().account,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
  ...config.WafParam,
});

new MynvOidcStack(app, `${pjPrefix}-OIDC`, {
  OrganizationName: config.OidcParam.OrganizationName,
  RepositoryNames: config.OidcParam.RepositoryNames,
});

const ecs = new MynvEcsStack(app, `${pjPrefix}-ECS`, {
  myVpc: prodVpc.myVpc,
  appKey: appKey.kmsKey,
  webAcl: waf.webAcl,
  alarmTopic: monitorAlarm.alarmTopic,
  prefix: pjPrefix,
  AlbBgCertificateIdentifier: config.AlbBgCertificateIdentifier,
  AlbCertificateIdentifier: config.AlbCertificateIdentifier,
  CertificateIdentifier: config.CertificateIdentifier,
  cloudFrontParam: config.CloudFrontParam,
  ecsFrontTasks: config.EcsFrontTasks,
  ecsFrontBgTasks: config.EcsFrontBgTasks,
  ecsBackBgTasks: config.EcsBackBgTasks,
  ecsBackTasks: config.EcsBackTasks,
  env: getProcEnv(),
  crossRegionReferences: true,
});

// Aurora
const dbCluster = new BLEADbAuroraPgStack(app, `${pjPrefix}-DBAuroraPg`, {
  myVpc: prodVpc.myVpc,
  dbAllocatedStorage: 25,
  vpcSubnets: prodVpc.myVpc.selectSubnets({
    subnetGroupName: 'Protected',
  }),
  appServerSecurityGroup: ecs.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.bastionApp.securityGroup,
  appKey: appKey.kmsKey,
  alarmTopic: monitorAlarm.alarmTopic,
  ...config.AuroraParam,
  env: getProcEnv(),
});

// Monitoring
// const appCanary = new BLEACanaryStack(app, `${pjPrefix}-ECSAppCanary`, {
//   alarmTopic: monitorAlarm.alarmTopic,
//   appEndpoint: front.cfDistribution.domainName,
//   env: getProcEnv(),
// });

new BLEADashboardStack(app, `${pjPrefix}-ECSAppDashboard`, {
  dashboardName: `${pjPrefix}-ECSApp`,
  webFront: ecs.cloudFront,
  alb: ecs.frontAlb,
  ecsClusterName: ecs.ecsCommon.ecsCluster.clusterName,
  ecsAlbServiceNames: ecs.frontEcsApps.map((ecsAlbApp) => ecsAlbApp.ecsServiceName),
  ecsInternalServiceNames: ecs.backEcsApps.map((ecsInternalApp) => ecsInternalApp.ecsServiceName),
  appTargetGroupNames: ecs.frontAlb.AlbTgs.map((AlbTg) => AlbTg.lbForAppTargetGroup.targetGroupName),
  dbClusterName: dbCluster.dbClusterName,
  albTgUnHealthyHostCountAlarms: ecs.frontAlb.AlbTgs.map((AlbTg) => AlbTg.albTgUnHealthyHostCountAlarm),
  // AutoScaleはCDK外で管理のため、固定値を修正要で設定
  //ecsScaleOnRequestCount: ecsApp.ecsScaleOnRequestCount,
  ecsScaleOnRequestCount: 50,
  //ecsTargetUtilizationPercent: ecsApp.ecsTargetUtilizationPercent,
  ecsTargetUtilizationPercent: 10000,
  // canaryDurationAlarm: appCanary.canaryDurationAlarm,
  // canaryFailedAlarm: appCanary.canaryFailedAlarm,
  env: getProcEnv(),
});

new MynvOpenSearchStack(app, `${pjPrefix}-OpenSearch`, {
  myVpc: prodVpc.myVpc,
  appServerSecurityGroup: ecs.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.bastionApp.securityGroup,
  ...config.OpensearchParam,
  env: getProcEnv(),
});

new ElastiCacheRedisStack(app, `${pjPrefix}-ElastiCacheRedis`, {
  myVpc: prodVpc.myVpc,
  appKey: appKey.kmsKey,
  alarmTopic: monitorAlarm.alarmTopic,
  appServerSecurityGroup: ecs.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.bastionApp.securityGroup,
  ...config.ElastiCacheRedisParam,
  env: getProcEnv(),
});

// AWS Backupを利用する場合は以下をif文も含めてコメントインする。
// 環境別パラメータファイル内でbackupDisasterRecoveryをtrueに設定するとDR用リージョンにクロスリージョンコピーされる。
// falseであればDRリージョンにクロスリージョンレプリケーションされず東京リージョンのみのデプロイとなる。

// const backupVault = new MynvBackupVaultStack(app, `${pjPrefix}-BackupVault`, {
//   env: getProcEnv(),
//   appKey: appKey.kmsKey,
// });

// if (config.BackupParam.backupDisasterRecovery) {
//   // DR用リージョンにKMSキーを作成
//   const appKeyDRRegion = new BLEAKeyAppStack(app, `${pjPrefix}-AppKeyDRRegion`, {
//     env: {
//       account: getProcEnv().account,
//       region: config.DRRegionParam.region,
//     },
//     crossRegionReferences: true,
//   });

//   // DR用リージョンにバックアップボールトを作成
//   const backupVaultDRRegion = new MynvBackupVaultStack(app, `${pjPrefix}-BackupVaultDRRegion`, {
//     env: {
//       account: getProcEnv().account,
//       region: config.DRRegionParam.region,
//     },
//     appKey: appKeyDRRegion.kmsKey,
//     crossRegionReferences: true,
//   });

//   // DR用リージョンと東京リージョンに作成されたバックアップボールトを指定して、バックアッププランを作成
//   new MynvBackupPlanStack(app, `${pjPrefix}-BackupPlan`, {
//     env: getProcEnv(),
//     vault: backupVault.vault,
//     secondaryVault: backupVaultDRRegion.vault,
//     backupSchedule: config.BackupParam.backupSchedule,
//     retentionPeriod: config.BackupParam.retentionPeriod,
//     crossRegionReferences: true,
//   });

// } else {

//   // 東京リージョンに作成されたバックアップボールトを指定して、バックアッププランを作成
//   new MynvBackupPlanStack(app, `${pjPrefix}-BackupPlan`, {
//     env: getProcEnv(),
//     vault: backupVault.vault,
//     backupSchedule: config.BackupParam.backupSchedule,
//     retentionPeriod: config.BackupParam.retentionPeriod,
//   });
// }

// serverless使用の場合以下をコメントイン、OpenSearchStackをコメントアウト
// new MynvOpenSearchServerlessStack(app,`${pjPrefix}-OpenSearchServerless`,{
//   myVpc: prodVpc.myVpc,
//   env: getProcEnv(),
// })

// StepFunctionsを使用したバッチ処理を使用する場合はコメントインする

// new MynvStepFunctionsSampleStack(app, `${pjPrefix}-StepFunctions`, {
//   myVpc: prodVpc.myVpc,
//   ecsClusterName: ecs.ecsCommon.ecsCluster.clusterName,
//   ecsTaskExecutionRole: ecs.ecsCommon.ecsTaskExecutionRole,
//   // 作成済みのECSタスク名を指定（事前に本CDK外で手動作成が必要）
//   ecsTaskName: 'runtask-sample',
//   env: getProcEnv(),
// })

// cognito使用の場合以下をコメントイン
// new CognitoStack(app, '${pjPrefix}-CognitoStack', {
//   domainPrefix: '${pjPrefix}',
//   ...config.CognitoParam,
// });

// --------------------------------- Tagging  -------------------------------------

// Tagging "Environment" tag to all resources in this app
const envTagName = 'Environment';
cdk.Tags.of(app).add(envTagName, config.Env.envName);
