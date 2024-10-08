import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import { IEcsAlbParam, IEcsParam, ICertificateIdentifier } from '../../params/interface';
import { EcsAppConstruct } from '../construct/ecs-app-construct';

import { LambdaFrontConstruct } from '../construct/ecs-app-construct/construct/lambda-construct';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface EcsAppStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  appKey: kms.IKey;
  alarmTopic: sns.Topic;
  prefix: string;
  ecsFrontTasks?: IEcsAlbParam;
  ecsBackTasks?: IEcsParam[];
  ecsAuthTasks?: IEcsParam[];
  ecsBastionTasks?: boolean;
}

export class EcsAppStack extends cdk.Stack {
  public readonly ecs: EcsAppConstruct;
  public readonly lambda: LambdaFrontConstruct;

  constructor(scope: Construct, id: string, props: EcsAppStackProps) {
    super(scope, id, props);

    const app = new EcsAppConstruct(this, `${props.prefix}-EcsApp`, {
      vpc: props.vpc,
      appKey: props.appKey,
      alarmTopic: props.alarmTopic,
      prefix: props.prefix,
      ecsFrontTasks: props.ecsFrontTasks,
      ecsBackTasks: props.ecsBackTasks,
      ecsAuthTasks: props.ecsAuthTasks,
      ecsBastionTasks: props.ecsBastionTasks ?? true,
    });
    this.ecs = app;
  }
}
