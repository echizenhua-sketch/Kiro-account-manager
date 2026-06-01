import { useState, useMemo } from 'react'
import { X, Search, Users, Mail, CreditCard, AlertCircle } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Badge, Switch } from '../ui'
import { useAccountsStore } from '../../store/accounts'
import type { Account } from '../../types/account'

interface ManagePoolAccountsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEn: boolean
  onAfterChange?: () => void
}

export function ManagePoolAccountsDialog({
  open,
  onOpenChange,
  isEn,
  onAfterChange
}: ManagePoolAccountsDialogProps) {
  const accounts = useAccountsStore(state => state.accounts)
  const updateAccount = useAccountsStore(state => state.updateAccount)
  const [searchQuery, setSearchQuery] = useState('')

  const accountList = useMemo(() => Array.from(accounts.values()), [accounts])

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accountList
    const q = searchQuery.toLowerCase()
    return accountList.filter(acc =>
      acc.email?.toLowerCase().includes(q) ||
      acc.id.toLowerCase().includes(q) ||
      acc.subscription?.title?.toLowerCase().includes(q)
    )
  }, [accountList, searchQuery])

  const inPoolCount = useMemo(
    () => accountList.filter(acc => acc.inProxyPool === true).length,
    [accountList]
  )

  const isEligible = (acc: Account): boolean =>
    acc.status === 'active' && !!acc.credentials?.accessToken

  const togglePool = (acc: Account, value: boolean): void => {
    updateAccount(acc.id, { inProxyPool: value })
    onAfterChange?.()
  }

  const selectAllVisible = (): void => {
    filteredAccounts.forEach(acc => {
      if (isEligible(acc) && acc.inProxyPool !== true) {
        updateAccount(acc.id, { inProxyPool: true })
      }
    })
    onAfterChange?.()
  }

  const deselectAllVisible = (): void => {
    filteredAccounts.forEach(acc => {
      if (acc.inProxyPool === true) {
        updateAccount(acc.id, { inProxyPool: false })
      }
    })
    onAfterChange?.()
  }

  const getSubscriptionColor = (title?: string): string => {
    if (!title) return 'bg-gray-500 text-white'
    const t = title.toUpperCase()
    if (t.includes('PRO+') || t.includes('PRO_PLUS') || t.includes('PROPLUS')) return 'bg-purple-500 text-white'
    if (t.includes('POWER')) return 'bg-amber-500 text-white'
    if (t.includes('PRO')) return 'bg-blue-500 text-white'
    return 'bg-gray-500 text-white'
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <Card className="relative w-[680px] max-h-[80vh] shadow-2xl border-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <CardHeader className="pb-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              {isEn ? 'Manage Pool Accounts' : '管理代理池账号'}
              <Badge variant="secondary" className="ml-1">
                {inPoolCount} / {accountList.length}
              </Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isEn
              ? 'Only accounts toggled on here will be used by the Kiro API proxy.'
              : '只有在此处开启的账号才会被 Kiro API 反代使用。'}
          </p>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isEn ? 'Search by email, ID or subscription...' : '搜索邮箱、ID 或订阅类型...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={selectAllVisible} disabled={filteredAccounts.length === 0}>
              {isEn ? 'Add all (filtered)' : '全部加入（按当前筛选）'}
            </Button>
            <Button size="sm" variant="outline" onClick={deselectAllVisible} disabled={filteredAccounts.length === 0}>
              {isEn ? 'Remove all (filtered)' : '全部移出（按当前筛选）'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-y-auto max-h-[55vh]">
          {filteredAccounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery ? (isEn ? 'No accounts found' : '未找到匹配的账号') : (isEn ? 'No accounts available' : '暂无账号')}
            </div>
          ) : (
            filteredAccounts.map(acc => {
              const eligible = isEligible(acc)
              const inPool = acc.inProxyPool === true
              return (
                <div
                  key={acc.id}
                  className={`p-3 border-b transition-colors ${eligible ? 'hover:bg-accent/30' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {acc.email || acc.id.substring(0, 12) + '...'}
                          </span>
                          <Badge className={`text-xs ${getSubscriptionColor(acc.subscription?.title)}`}>
                            <CreditCard className="h-3 w-3 mr-1" />
                            {acc.subscription?.title || 'Unknown'}
                          </Badge>
                          {!eligible && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {isEn ? 'Not active' : '不可用'}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                          ID: {acc.id}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={inPool}
                      onCheckedChange={(v) => togglePool(acc, v)}
                      disabled={!eligible && !inPool}
                    />
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
