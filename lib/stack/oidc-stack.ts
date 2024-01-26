import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { OidcIAMRoleConstruct } from '../construct/oidc-iamrole-construct';

export interface OidcStackProps extends cdk.StackProps {
  OrganizationName: string;
  RepositoryNames: Record<string, string>;
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
    new OidcIAMRoleConstruct(this, 'WafRole', {
      OrganizationName: props.OrganizationName,
      RepositoryName: props.RepositoryNames.WafRepositoryName,
      openIdConnectProviderArn: oidcProvider.openIdConnectProviderArn,
      statement: [
        {
          actions: ['wafv2:ListWebACLs', 'wafv2:GetWebACL', 'wafv2:UpdateWebACL'],
          resources: ['*'],
        },
      ],
    });
    // InfraResources用ロール
    new OidcIAMRoleConstruct(this, 'InfraResourcesRole', {
      OrganizationName: props.OrganizationName,
      RepositoryName: props.RepositoryNames.InfraRepositoryName,
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
