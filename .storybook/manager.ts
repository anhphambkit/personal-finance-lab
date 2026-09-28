// Preserve bookmarks from the original combined component catalog.
const legacyStories: Record<string, string> = {
  'active-account': 'accountcard--active',
  'frozen-account': 'accountcard--frozen',
  money: 'moneydisplay--default',
  'amount-input': 'moneyinput--default',
  'invalid-amount': 'moneyinput--invalid',
  transactions: 'transactiontable--default',
  details: 'transferdetailsform--default',
  review: 'transferreview--default',
  confirming: 'transferreview--confirming',
  'uncertain-outcome': 'transferreview--uncertain',
  receipt: 'transferreceipt--default',
}
const url = new URL(window.location.href)
const prefix = '/story/banking-components--'
const path = url.searchParams.get('path')
if (path?.startsWith(prefix)) {
  const destination = legacyStories[path.slice(prefix.length)]
  if (destination) {
    url.searchParams.set('path', `/story/banking-${destination}`)
    window.location.replace(url.href)
  }
}
