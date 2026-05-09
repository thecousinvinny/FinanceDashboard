import type { CardStyle, CardNetwork, CardType, BankType } from '@/types'

export interface SeedCard {
  id:         string
  bank_id:    string
  name:       string
  alias:      string
  type:       CardType
  last4:      string
  network:    CardNetwork
  expires:    string
  cardholder: string
  style:      CardStyle
  is_default: boolean
}

export interface SeedBank {
  id:    string
  name:  string
  type:  BankType
  last4: string
}

export const SEED_BANKS: SeedBank[] = [
  { id: 'b01', name: 'Chase',    type: 'Checking',    last4: '4421' },
  { id: 'b02', name: 'Amex',     type: 'Savings',     last4: '0044' },
  { id: 'b03', name: 'Fidelity', type: 'Investment',  last4: '9103' },
]

export const SEED_CARDS: SeedCard[] = [
  {
    id: 'card01', bank_id: 'b01',
    name: 'LUMEN', alias: 'Daily Driver',
    type: 'Debit', last4: '4421', network: 'Visa',
    expires: '11/29', cardholder: 'ALEX MORGAN',
    style: 'black', is_default: true,
  },
  {
    id: 'card02', bank_id: 'b02',
    name: 'LUMEN', alias: 'Travel Card',
    type: 'Debit', last4: '0044', network: 'Amex',
    expires: '08/27', cardholder: 'ALEX MORGAN',
    style: 'green', is_default: false,
  },
  {
    id: 'card03', bank_id: 'b01',
    name: 'LUMEN', alias: 'Rewards',
    type: 'Credit', last4: '7823', network: 'Mastercard',
    expires: '03/28', cardholder: 'ALEX MORGAN',
    style: 'gold', is_default: false,
  },
]

export function cardsForBank(bankId: string, cards: SeedCard[]) {
  return cards.filter(c => c.bank_id === bankId)
}
