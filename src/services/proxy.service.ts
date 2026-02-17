import type { ProxySetting } from '../models/index.js';

export interface ProxyDataStore {
  getProxySettings(): Promise<ProxySetting[]>;
}

export class ProxyService {
  constructor(private dataStore: ProxyDataStore) {}

  /**
   * 代理申請が可能かチェック
   */
  async canApplyAsProxy(
    proxyUserId: string,
    principalUserId: string,
    currentDate: Date = new Date()
  ): Promise<boolean> {
    const settings = await this.getActiveSettings(currentDate);
    return settings.some(s =>
      s.proxyUserId === proxyUserId &&
      s.principalUserId === principalUserId &&
      s.proxyType === 'application'
    );
  }

  /**
   * 代理処理（承認等）が可能かチェック
   */
  async canProcessAsProxy(
    proxyUserId: string,
    approverId: string,
    stepRoleType?: string,
    currentDate: Date = new Date()
  ): Promise<boolean> {
    const settings = await this.getActiveSettings(currentDate);
    return settings.some(s =>
      s.proxyUserId === proxyUserId &&
      s.principalUserId === approverId &&
      s.proxyType === 'processing' &&
      (s.targetRoles.length === 0 || !stepRoleType || s.targetRoles.includes(stepRoleType))
    );
  }

  /**
   * ユーザーが代理可能な委任元一覧を取得
   */
  async getProxiesForUser(
    proxyUserId: string,
    currentDate: Date = new Date()
  ): Promise<ProxySetting[]> {
    const settings = await this.getActiveSettings(currentDate);
    return settings.filter(s => s.proxyUserId === proxyUserId);
  }

  /**
   * ユーザーの代理先一覧を取得
   */
  async getPrincipalsForProxy(
    principalUserId: string,
    currentDate: Date = new Date()
  ): Promise<ProxySetting[]> {
    const settings = await this.getActiveSettings(currentDate);
    return settings.filter(s => s.principalUserId === principalUserId);
  }

  private async getActiveSettings(currentDate: Date): Promise<ProxySetting[]> {
    const all = await this.dataStore.getProxySettings();
    return all.filter(s =>
      s.isActive &&
      s.validFrom <= currentDate &&
      (s.validTo === null || s.validTo >= currentDate)
    );
  }
}
