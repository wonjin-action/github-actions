import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_kms as kms } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';

export class BLEAKeyAppStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // CMK
    const kmsKey = new kms.Key(this, 'Key', {
      enableKeyRotation: true,
      description: 'for App',
      alias: `${id}-for-app`,
    });
    this.kmsKey = kmsKey;

    // Permission to access KMS Key from CloudWatch Logs
    kmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        principals: [new iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:*`,
          },
        },
      }),
    );
  }
}
