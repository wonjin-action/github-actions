import * as cdk from 'aws-cdk-lib';
import { DbAuroraStack } from '../lib/stack/db-aurora-stack';
import { WafStack } from '../lib/stack/waf-stack';
import { ElastiCacheRedisStack } from '../lib/stack/elasticache-redis-stack';
import * as fs from 'fs';
import { IConfig } from '../params/interface';
import { StepFunctionsSampleStack } from '../lib/stack/stepfunctions-sample-stack';
import { OpenSearchStack } from '../lib/stack/opensearch-stack';
import { BackupVaultStack } from '../lib/stack/backup-vault-stack';
import { BackupPlanStack } from '../lib/stack/backup-plan-stack';
//OpenSearchSererless使用の場合以下をコメントイン、import { OpenSearchStack } from '../lib/-opensearch-stack';をコメントアウト
//import {OpenSearchServerlessStack} from '../lib/-opensearchserverless-stack';
import { MonitorStack } from '../lib/stack/monitor-stack';
import { EcsAppStack } from '../lib/stack/ecs-app-stack';
import { Ec2Action } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { CloudfrontStack } from '../lib/stack/cloudfront-stack';
import { OidcStack } from '../lib/stack/oidc-stack';
import { InfraResourcesPipelineStack } from '../lib/stack/pipeline-infraresources-stack';
import { ShareResourcesStack } from '../lib/stack/share-resources-stack';

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

const shareResources = new ShareResourcesStack(app, `${pjPrefix}-ShareResources`, {
  pjPrefix,
  notifyEmail: config.NotifierParam.monitoringNotifyEmail,
  domainPrefix: `${pjPrefix}`.toLowerCase(),
  workspaceId: workspaceId,
  channelId: channelIdMon,
  ...config.CognitoParam,
  myVpcCidr: config.VpcParam.cidr,
  myVpcMaxAzs: config.VpcParam.maxAzs,
  env: getProcEnv(),
});

// InfraResources
new InfraResourcesPipelineStack(app, `${pjPrefix}-Pipeline`, {
  ...config.InfraResourcesPipelineParam,
  env: envKey,
});

const waf = new WafStack(app, `${pjPrefix}-Waf`, {
  scope: 'CLOUDFRONT',
  env: {
    account: getProcEnv().account,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
  ...config.WafParam,
});

new OidcStack(app, `${pjPrefix}-OIDC`, {
  OrganizationName: config.OidcParam.OrganizationName,
  RepositoryNames: config.OidcParam.RepositoryNames,
});

const ecs = new EcsAppStack(app, `${pjPrefix}-ECS`, {
  myVpc: shareResources.myVpc,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  prefix: pjPrefix,
  AlbBgCertificateIdentifier: config.AlbBgCertificateIdentifier,
  AlbCertificateIdentifier: config.AlbCertificateIdentifier,
  ecsFrontTasks: config.EcsFrontTasks,
  ecsFrontBgTasks: config.EcsFrontBgTasks,
  ecsBackBgTasks: config.EcsBackBgTasks,
  ecsBackTasks: config.EcsBackTasks,
  env: getProcEnv(),
  crossRegionReferences: true,
});

const cloudfront = new CloudfrontStack(app, `${pjPrefix}-Cloudfront`, {
  pjPrefix: pjPrefix,
  webAcl: waf.webAcl,
  CertificateIdentifier: config.CertificateIdentifier,
  cloudFrontParam: config.CloudFrontParam,
  appAlbs: [ecs.app.frontAlb.appAlb],
  env: getProcEnv(),
  crossRegionReferences: true,
});

// Aurora
const dbCluster = new DbAuroraStack(app, `${pjPrefix}-DBAurora`, {
  myVpc: shareResources.myVpc,
  dbAllocatedStorage: 25,
  vpcSubnets: shareResources.myVpc.selectSubnets({
    subnetGroupName: 'Protected',
  }),
  appServerSecurityGroup: ecs.app.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.app.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.app.bastionApp.securityGroup,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  ...config.AuroraParam,
  env: getProcEnv(),
});

new MonitorStack(app, `${pjPrefix}-MonitorStack`, {
  pjPrefix: `${pjPrefix}`,
  alarmTopic: shareResources.alarmTopic,
  appEndpoint: 'https://demo-endpoint.com',
  dashboardName: `${pjPrefix}-ECSApp`,
  cfDistributionId: cloudfront.cfDistributionId,
  albFullName: ecs.app.frontAlb.appAlb.loadBalancerFullName,
  appTargetGroupNames: ecs.app.frontAlb.AlbTgs.map((AlbTg) => AlbTg.lbForAppTargetGroup.targetGroupName),
  albTgUnHealthyHostCountAlarms: ecs.app.frontAlb.AlbTgs.map((AlbTg) => AlbTg.albTgUnHealthyHostCountAlarm),
  ecsClusterName: ecs.app.ecsCommon.ecsCluster.clusterName,
  ecsAlbServiceNames: ecs.app.frontEcsApps.map((ecsAlbApp) => ecsAlbApp.ecsServiceName),
  ecsInternalServiceNames: ecs.app.backEcsApps.map((ecsInternalApp) => ecsInternalApp.ecsServiceName),
  dbClusterName: dbCluster.dbClusterName,
  // AutoScaleはCDK外で管理のため、固定値を修正要で設定
  ecsScaleOnRequestCount: 50,
  ecsTargetUtilizationPercent: 10000,
  // canaryDurationAlarm: appCanary.canaryDurationAlarm,
  // canaryFailedAlarm: appCanary.canaryFailedAlarm,
  env: getProcEnv(),
});

new OpenSearchStack(app, `${pjPrefix}-OpenSearch`, {
  myVpc: shareResources.myVpc,
  appServerSecurityGroup: ecs.app.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.app.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.app.bastionApp.securityGroup,
  ...config.OpensearchParam,
  env: getProcEnv(),
});

new ElastiCacheRedisStack(app, `${pjPrefix}-ElastiCacheRedis`, {
  myVpc: shareResources.myVpc,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  appServerSecurityGroup: ecs.app.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.app.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.app.bastionApp.securityGroup,
  ...config.ElastiCacheRedisParam,
  env: getProcEnv(),
});

// AWS Backupを利用する場合は以下をif文も含めてコメントインする。
// 環境別パラメータファイル内でbackupDisasterRecoveryをtrueに設定するとDR用リージョンにクロスリージョンコピーされる。
// falseであればDRリージョンにクロスリージョンレプリケーションされず東京リージョンのみのデプロイとなる。

// const backupVault = new BackupVaultStack(app, `${pjPrefix}-BackupVault`, {
//   env: getProcEnv(),
//   appKey: shareResources.appKey,
// });

// if (config.BackupParam.backupDisasterRecovery) {
//   // DR用リージョンにKMSキーを作成
//   const appKeyDRRegion = new KeyAppStack(app, `${pjPrefix}-AppKeyDRRegion`, {
//     env: {
//       account: getProcEnv().account,
//       region: config.DRRegionParam.region,
//     },
//     crossRegionReferences: true,
//   });

//   // DR用リージョンにバックアップボールトを作成
//   const backupVaultDRRegion = new BackupVaultStack(app, `${pjPrefix}-BackupVaultDRRegion`, {
//     env: {
//       account: getProcEnv().account,
//       region: config.DRRegionParam.region,
//     },
//     appKey: appKeyDRRegion.kmsKey,
//     crossRegionReferences: true,
//   });

//   // DR用リージョンと東京リージョンに作成されたバックアップボールトを指定して、バックアッププランを作成
//   new BackupPlanStack(app, `${pjPrefix}-BackupPlan`, {
//     env: getProcEnv(),
//     vault: backupVault.vault,
//     secondaryVault: backupVaultDRRegion.vault,
//     backupSchedule: config.BackupParam.backupSchedule,
//     retentionPeriod: config.BackupParam.retentionPeriod,
//     crossRegionReferences: true,
//   });

// } else {

//   // 東京リージョンに作成されたバックアップボールトを指定して、バックアッププランを作成
//   new BackupPlanStack(app, `${pjPrefix}-BackupPlan`, {
//     env: getProcEnv(),
//     vault: backupVault.vault,
//     backupSchedule: config.BackupParam.backupSchedule,
//     retentionPeriod: config.BackupParam.retentionPeriod,
//   });
// }

// serverless使用の場合以下をコメントイン、OpenSearchStackをコメントアウト
// new OpenSearchServerlessStack(app,`${pjPrefix}-OpenSearchServerless`,{
//   myVpc: shareResources.myVpc,
//   env: getProcEnv(),
// })

// StepFunctionsを使用したバッチ処理を使用する場合はコメントインする

// new StepFunctionsSampleStack(app, `${pjPrefix}-StepFunctions`, {
//   myVpc: shareResources.myVpc,
//   ecsClusterName: ecs.app.ecsCommon.ecsCluster.clusterName,
//   ecsTaskExecutionRole: ecs.app.ecsCommon.ecsTaskExecutionRole,
//   // 作成済みのECSタスク名を指定（事前に本CDK外で手動作成が必要）
//   ecsTaskName: 'runtask-sample',
//   env: getProcEnv(),
// })

// --------------------------------- Tagging  -------------------------------------

// Tagging "Environment" tag to all resources in this app
const envTagName = 'Environment';
cdk.Tags.of(app).add(envTagName, config.Env.envName);
