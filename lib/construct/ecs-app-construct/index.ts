import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EcsappConstruct } from './construct/ecs-app-construct';
import { EcsCommonConstruct } from './construct/ecs-common-construct';
import { PipelineEcspressoConstruct } from './construct/pipeline-ecspresso-construct';
import { IEcsAlbParam, IEcsParam } from '../../../params/interface';
import { BastionECSAppConstruct } from './construct/bastion-ecs-construct';
import { AlbConstruct } from '../alb-construct';

interface EcsAppConstructProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  albConstruct: AlbConstruct;
  ecsFrontTasks?: IEcsAlbParam;
  ecsBackTasks?: IEcsParam[];
  ecsBastionTasks: boolean;
}

// 아래의 클래스를 인스턴스화 하면, 프론트와 백엔드 ecs가 만들어진다.
export class EcsAppConstruct extends Construct {
  public readonly frontEcsApps: EcsappConstruct[];
  public readonly backEcsApps: EcsappConstruct[];
  public readonly ecsCommon: EcsCommonConstruct;
  public readonly bastionApp: BastionECSAppConstruct;

  constructor(scope: Construct, id: string, props: EcsAppConstructProps) {
    super(scope, id);

    //ECS Common
    const ecsCommon = new EcsCommonConstruct(this, `${props.prefix}-EcsCommon`, {
      vpc: props.vpc,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
    });
    this.ecsCommon = ecsCommon;
    if (props.ecsFrontTasks) {
      const frontEcsApps = props.ecsFrontTasks.map((app) => {
        return new EcsappConstruct(this, `${props.prefix}-${app.appName}-FrontApp-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: app.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSg: [props.albConstruct.appAlbSecurityGroup],
          portNumber: app.portNumber,
        });
      });
      this.frontEcsApps = frontEcsApps;

      //Pipeline for Frontend Rolling
      frontEcsApps.forEach((ecsApp, index) => {
        new PipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-FrontApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          targetGroup: props.albConstruct.targetGroupConstructs[index].targetGroup,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          ecsNameSpace: ecsCommon.ecsNameSpace,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          port: ecsApp.portNumber,
          // taskRole: props.taskRole,
        });
      });
    }

    if (props.ecsBackTasks) {
      const backEcsApps = props.ecsBackTasks.map((ecsApp) => {
        return new EcsappConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Ecs-Resources`, {
          vpc: props.vpc,
          ecsCluster: ecsCommon.ecsCluster,
          appName: ecsApp.appName,
          prefix: props.prefix,
          appKey: props.appKey,
          alarmTopic: props.alarmTopic,
          allowFromSg: this.frontEcsApps.map((ecsAlbApp) => ecsAlbApp.securityGroupForFargate),
          portNumber: ecsApp.portNumber,
          useServiceConnect: true,
        });
      });
      this.backEcsApps = backEcsApps;

      //Pipeline for Backend Rolling
      backEcsApps.forEach((ecsApp) => {
        new PipelineEcspressoConstruct(this, `${props.prefix}-${ecsApp.appName}-BackApp-Pipeline`, {
          prefix: props.prefix,
          appName: ecsApp.appName,
          ecsCluster: ecsCommon.ecsCluster,
          ecsServiceName: ecsApp.ecsServiceName,
          securityGroup: ecsApp.securityGroupForFargate,
          vpc: props.vpc,
          logGroup: ecsApp.fargateLogGroup,
          logGroupForServiceConnect: ecsApp.serviceConnectLogGroup,
          ecsNameSpace: ecsCommon.ecsNameSpace,
          executionRole: ecsCommon.ecsTaskExecutionRole,
          port: ecsApp.portNumber,
          // taskRole: props.taskRole,
        });
      });
    }

    //Bastion Container
    if (props.ecsBastionTasks) {
      const bastionApp = new BastionECSAppConstruct(this, `${props.prefix}-Bastion-ECSAPP`, {
        vpc: props.vpc,
        appKey: props.appKey,
        containerImageTag: 'bastionimage',
        containerConfig: {
          cpu: 256,
          memoryLimitMiB: 512,
        },
        repositoryName: 'bastionrepo',
        ecsTaskExecutionRole: ecsCommon.ecsTaskExecutionRole,
      });
      this.bastionApp = bastionApp;
    } else {
      // 베스천 호스트가 생성되지 않았으므로, bastionApp은 초기화되지 않음
      console.log('Bastion ECS tasks are not enabled.');
    }
  }
}
