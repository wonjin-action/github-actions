import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../params/interface';
import { EcsAppConstruct } from '../construct/ecs-app-construct';
import { AlbConstruct } from '../construct/alb-construct';
import { LambdaFrontConstruct } from '../construct/lambda-construct/index-lamba';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface EcsAppStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  // albCertificateIdentifier?: ICertificateIdentifier;
  ecsFrontTasks?: IEcsAlbParam;
  ecsBackTasks?: IEcsParam[];
  ecsAuthTasks?: IEcsParam[];
  ecsBastionTasks?: boolean;
}

export class EcsAppStack extends cdk.Stack {
  public readonly ecs: EcsAppConstruct;
  public readonly lambda: LambdaFrontConstruct;
  // public readonly alb: AlbConstruct;

  constructor(scope: Construct, id: string, props: EcsAppStackProps) {
    super(scope, id, props);

    // const albConstruct = new AlbConstruct(this, `${props.prefix}-Alb`, {
    //   vpc: props.vpc,
    //   alarmTopic: props.alarmTopic,
    //   albCertificateIdentifier: props.albCertificateIdentifier,
    //   ecsApps: props.ecsFrontTasks,
    // });
    // this.alb = albConstruct;

    const app = new EcsAppConstruct(this, `${props.prefix}-EcsApp`, {
      vpc: props.vpc,
      appKey: props.appKey,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
      // albConstruct: albConstruct,
      ecsFrontTasks: props.ecsFrontTasks,
      ecsBackTasks: props.ecsBackTasks,
      ecsAuthTasks: props.ecsAuthTasks,
      ecsBastionTasks: props.ecsBastionTasks ?? true,
    });
    this.ecs = app;

    // Security Group FOR lambda

    const lamba_securityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow ',
      allowAllOutbound: true,
    });

    lamba_securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    const lambdaApp = new LambdaFrontConstruct(this, `${props.prefix}-LambdaApp`, {
      // appname : app.
      vpc: props.vpc,
      prefix: props.prefix,
      securityGroup: lamba_securityGroup,
      alarmTopic: props.alarmTopic,
      cloudmap: app.cloudmap, // EcsAppConstruct라는 클래스에 cloudmap 인스턴스를 생성하므로, EcsAppConstruct의 인스턴스 변수에서 cloudmap을 참조한다.
    });
    this.lambda = lambdaApp;
  }
}
