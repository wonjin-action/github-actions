import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { OidcIamRoleConstruct } from '../construct/oidc-iamrole-construct';

export interface OidcStackProps extends cdk.StackProps {
  organizationName: string;
  repositoryNames: Record<string, string>;
}

export class OidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OidcStackProps) {
    super(scope, id, props);

    // GithubActionsと接続するためのOpenIdConnectを作成
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubActionsOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // WAF用ロール
    new OidcIamRoleConstruct(this, 'WafRole', {
      organizationName: props.organizationName,
      repositoryName: props.repositoryNames.WafRepositoryName,
      openIdConnectProviderArn: oidcProvider.openIdConnectProviderArn,
      statement: [
        {
          actions: ['wafv2:ListWebACLs', 'wafv2:GetWebACL', 'wafv2:UpdateWebACL'],
          resources: ['*'],
        },
      ],
    });
    // InfraResources用ロール
    new OidcIamRoleConstruct(this, 'InfraResourcesRole', {
      organizationName: props.organizationName,
      repositoryName: props.repositoryNames.InfraRepositoryName,
      openIdConnectProviderArn: oidcProvider.openIdConnectProviderArn,
      statement: [
        {
          actions: ['cloudformation:DescribeStacks', 's3:PutObject'],
          resources: ['*'],
        },
      ],
    });
  }
}
