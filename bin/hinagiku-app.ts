import * as cdk from 'aws-cdk-lib';
import { DbAuroraStack } from '../lib/stack/db-aurora-stack';
import { WafStack } from '../lib/stack/waf-stack';
import { ElastiCacheRedisStack } from '../lib/stack/elasticache-redis-stack';
import * as fs from 'fs';
import { IConfig, IEnv } from '../params/interface';
import { MonitorStack } from '../lib/stack/monitor-stack';
import { EcsAppStack } from '../lib/stack/ecs-app-stack';
import { CloudfrontStack } from '../lib/stack/cloudfront-stack';
import { OidcStack } from '../lib/stack/oidc-stack';
import { InfraResourcesPipelineStack } from '../lib/stack/pipeline-infraresources-stack';
import { ShareResourcesStack } from '../lib/stack/share-resources-stack';

const app = new cdk.App();

function loadContextVariable(): string {
  const argContext = 'environment';
  const envKey = app.node.tryGetContext(argContext);
  if (envKey == undefined)
    throw new Error(`Please specify environment with context option. ex) cdk deploy -c ${argContext}=dev`);
  //Read Typescript Environment file
  const TsEnvPath = './params/' + envKey + '.ts';
  if (!fs.existsSync(TsEnvPath)) throw new Error(`Can't find a ts environment file [../params/` + envKey + `.ts]`);

  return envKey;
}

function getConfig(deployEnv: string): IConfig {
  const tsEnvPath = './params/' + deployEnv + '.ts';
  if (!fs.existsSync(tsEnvPath)) {
    throw new Error(`Can't find a ts environment file [../params/${deployEnv}.ts]`);
  }

  return require('../params/' + deployEnv); // eslint-disable-line @typescript-eslint/no-var-requires
}

// ----------------------- Environment variables for stack ------------------------------

// Define account id and region from context.
// If "env" isn't defined on the environment variable in context, use account and region specified by "--profile".
function getProcEnv(env: IEnv) {
  return {
    account: env.account ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: env.region ?? process.env.CDK_DEFAULT_REGION,
  };
}

const envName: string = loadContextVariable();
const config: IConfig = getConfig(envName);
const systemName = 'Hinagiku';
const pjPrefix = `${systemName}-${config.Env.envName}`;
const deployEnv: cdk.Environment = getProcEnv(config.Env);

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
  env: deployEnv,
});

// InfraResources
new InfraResourcesPipelineStack(app, `${pjPrefix}-Pipeline`, {
  ...config.InfraResourcesPipelineParam,
  env: envName,
});

const waf = new WafStack(app, `${pjPrefix}-Waf`, {
  scope: 'CLOUDFRONT',
  env: {
    account: deployEnv.account,
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
  env: deployEnv,
  crossRegionReferences: true,
});

const cloudfront = new CloudfrontStack(app, `${pjPrefix}-Cloudfront`, {
  pjPrefix: pjPrefix,
  webAcl: waf.webAcl,
  CertificateIdentifier: config.CertificateIdentifier,
  cloudFrontParam: config.CloudFrontParam,
  appAlbs: [ecs.app.frontAlb.appAlb],
  env: deployEnv,
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
  env: deployEnv,
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
  env: deployEnv,
});

new ElastiCacheRedisStack(app, `${pjPrefix}-ElastiCacheRedis`, {
  myVpc: shareResources.myVpc,
  appKey: shareResources.appKey,
  alarmTopic: shareResources.alarmTopic,
  appServerSecurityGroup: ecs.app.backEcsApps[0].securityGroupForFargate,
  // appServerSecurityGroup: ecs.app.backEcsAppsBg[0].securityGroupForFargate,
  bastionSecurityGroup: ecs.app.bastionApp.securityGroup,
  ...config.ElastiCacheRedisParam,
  env: deployEnv,
});

// --------------------------------- Tagging  -------------------------------------

// Tagging "Environment" tag to all resources in this app
const envTagName = 'Environment';
cdk.Tags.of(app).add(envTagName, config.Env.envName);
