import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as CryptoJS from 'crypto-js';

export interface BLEAWafStackProps extends cdk.StackProps {
  basicAuthUserName: string;
  basicAuthUserPass: string;
  scope: string;
  overrideAction_CommonRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_KnownBadInputsRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_AmazonIpReputationList: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_LinuxRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_SQLiRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  overrideAction_CSCRuleSet: wafv2.CfnWebACL.OverrideActionProperty;
  ruleAction_IPsetRuleSet: wafv2.CfnWebACL.RuleActionProperty;
  ruleAction_BasicRuleSet: wafv2.CfnWebACL.RuleActionProperty;
  allowIPList: string[];
}

export class BLEAWafStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: BLEAWafStackProps) {
    super(scope, id, props);

    // Basic認証で用いるパスワード8文字を生成
    const plaintext = props.basicAuthUserPass;
    const hash = CryptoJS.SHA256(plaintext).toString();
    const randomString = hash.slice(0, 8);

    // Basic認証で用いるユーザー名をSSMパラメータストアに生成
    const maintenanceUserName = new ssm.CfnParameter(this, 'maintenanceUserName', {
      type: 'String',
      name: 'maintenanceUserName',
      value: props.basicAuthUserName,
    });

    // Basic認証で用いるパスワードをSSMパラメータストアに生成
    const maintenanceUserPass = new ssm.CfnParameter(this, 'maintenanceUserPass', {
      type: 'String',
      name: 'maintenanceUserPass',
      value: randomString,
    });

    // SSMパラメータストアのユーザー名とパスワードを用いてBasic認証文字列を生成
    const authToken = maintenanceUserName.value + ':' + maintenanceUserPass.value;
    const BASE64 = Buffer.from(authToken).toString('base64');
    const authString = 'Basic ' + BASE64;

    // IPsetルールを作成
    const IPSetRule = new wafv2.CfnIPSet(this, 'IPset', {
      name: 'IPset',
      ipAddressVersion: 'IPV4',
      scope: props.scope,
      addresses: props.allowIPList,
    });

    // WebACLを作成
    const webAcl = new wafv2.CfnWebACL(this, cdk.Stack.of(this).stackName + 'WebAcl', {
      defaultAction: { allow: {} },
      scope: props.scope,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'BLEAWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          priority: 1,
          overrideAction: props.overrideAction_CommonRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesCommonRuleSet',
          },
          name: 'AWSManagedRulesCommonRuleSet',
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        {
          priority: 2,
          overrideAction: props.overrideAction_KnownBadInputsRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
          },
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
        {
          priority: 3,
          overrideAction: props.overrideAction_AmazonIpReputationList,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesAmazonIpReputationList',
          },
          name: 'AWSManagedRulesAmazonIpReputationList',
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
        },
        {
          priority: 4,
          overrideAction: props.overrideAction_LinuxRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesLinuxRuleSet',
          },
          name: 'AWSManagedRulesLinuxRuleSet',
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesLinuxRuleSet',
            },
          },
        },
        {
          priority: 5,
          overrideAction: props.overrideAction_SQLiRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesSQLiRuleSet',
          },
          name: 'AWSManagedRulesSQLiRuleSet',
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
        },
        {
          priority: 6,
          action: props.ruleAction_IPsetRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IPset',
          },
          name: 'IPset',
          statement: {
            notStatement: {
              statement: {
                ipSetReferenceStatement: {
                  arn: IPSetRule.attrArn,
                },
              },
            },
          },
        },
        {
          name: 'BasicAuth',
          priority: 7,
          statement: {
            notStatement: {
              statement: {
                byteMatchStatement: {
                  searchString: authString,
                  fieldToMatch: {
                    singleHeader: {
                      name: 'authorization',
                    },
                  },
                  textTransformations: [
                    {
                      priority: 0,
                      type: 'NONE',
                    },
                  ],
                  positionalConstraint: 'EXACTLY',
                },
              },
            },
          },
          action: props.ruleAction_BasicRuleSet,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: false,
            metricName: 'BasicAuthRule',
          },
        },
        // CyberSecurityCloud社のマネージドルールを適用する場合は下記コードをコメントインする。
        // 当ルールのWCUが1000のため、他ルールと組み合わせる場合はWCUの限界値を超えないようにルールの組み合わせに考慮する必要がある。
        // 例)AWSマネージドルールをすべてコメントアウトしてCyberSecurityCloud社のマネージドルールをコメントイン
        // また事前にAWSマーケットプレイスからサブスクリプション購入する必要がある。
        //  購入方法
        // ・aws-marketplace:ViewSubscriptionsとaws-marketplace:Subscribeを許可しているポリシーを持つIAMユーザーにログイン、もしくはスイッチロールする
        // ・AWSマーケットプレイス(https://aws.amazon.com/marketplace/pp/prodview-kyur2d2omnrlg?sr=0-1&ref_=beagle&applicationId=AWSMPContessa)にアクセス
        // ・「View purchse options」ボタンをクリック
        // ・「Subscribe」ボタンをクリック
        //
        //
        // {
        //   priority: 1,
        //   overrideAction: props.overrideAction_CSCRuleSet,
        //   visibilityConfig: {
        //     sampledRequestsEnabled: true,
        //     cloudWatchMetricsEnabled: true,
        //     metricName: 'CyberSecurityCloud-HighSecurityOWASPSet-',
        //   },
        //   name: 'CyberSecurityCloud-HighSecurityOWASPSet-',
        //   statement: {
        //     managedRuleGroupStatement: {
        //       vendorName: 'Cyber Security Cloud Inc.',
        //       name: 'CyberSecurityCloud-HighSecurityOWASPSet-',
        //     },
        //   },
        // },
        //
      ],
    });
    this.webAcl = webAcl;

    // // ------------------------------------------------------------------------
    // // CloudFront Distrubution
    // //
    // const cfdistribution = new cloudfront.Distribution(this, 'Distribution', {
    //   defaultBehavior: {
    //     origin: new origins.LoadBalancerV2Origin(props.originAlb),
    //     viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    //     allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
    //     cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    //     originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
    //   },
    //   defaultRootObject: '/', // Need for SecurityHub Findings CloudFront.1 compliant

    //   domainNames: [fqdn],
    //   certificate: cloudfrontCert,
    //   additionalBehaviors: {
    //     '/static/*': {
    //       origin: new origins.S3Origin(props.originS3),
    //       viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    //       cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    //     },
    //   },
    //   enableLogging: true,
    //   logBucket: props.logBucket,
    //   logIncludesCookies: true,
    //   logFilePrefix: 'CloudFrontAccessLogs/',
    //   errorResponses: [
    //     {
    //       httpStatus: 403,
    //       responseHttpStatus: 403,
    //       responsePagePath: '/static/sorry.html',
    //       ttl: cdk.Duration.seconds(20),
    //     },
    //   ],
    //   webAclId: webAcl.attrArn,
    // });

    // // Add A Record to Route 53
    // new r53.ARecord(this, 'appRecord', {
    //   recordName: props.hostName,
    //   zone: hostedZone,
    //   target: r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(cfdistribution)),
    // });
  }
}
