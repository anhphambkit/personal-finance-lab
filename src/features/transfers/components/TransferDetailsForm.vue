<script setup lang="ts">
import { useBankingContext } from '@/data/api/bankingContext'
import {
  DEMO_NEW_OTHER_BANK_RECIPIENT,
  DEMO_NEW_SAME_BANK_NUMBER,
} from '@/shared/config/demoRecipients'
import type { CreateBeneficiaryRequest } from '@/contracts/beneficiaries'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import UForm from '@nuxt/ui/components/Form.vue'
import UFormField from '@nuxt/ui/components/FormField.vue'
import USelect from '@nuxt/ui/components/Select.vue'
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue'
import UCheckbox from '@nuxt/ui/components/Checkbox.vue'
import URadioGroup from '@nuxt/ui/components/RadioGroup.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { Account } from '@/domain/accounts/account'
import type { Beneficiary } from '@/domain/beneficiaries/beneficiary'
import { maskAccountNumber } from '@/domain/accounts/maskAccountNumber'
import MoneyInput from '@/shared/components/MoneyInput.vue'
import { strictNumericInput } from '@/shared/strictNumericInput'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import {
  prepareTransfer,
  transferDetailsSchema,
  type TransferDetails,
  type TransferDraft,
} from '../transferDraft'

const props = defineProps<{
  accounts: Account[]
  beneficiaries: Beneficiary[]
  initial?: TransferDetails
  demoDefaults?: boolean
}>()
const emit = defineEmits<{ review: [draft: TransferDraft]; change: [details: TransferDetails] }>()
const form = ref<{ clear(path?: string | RegExp): void }>()
const recipientError = ref('')
const { api } = useBankingContext()
const checking = ref(false)
const checkedRecipient = ref<CreateBeneficiaryRequest>()
const bankOptions = [
  { label: 'Vietcombank', value: 'Vietcombank' },
  { label: 'Agribank', value: 'Agribank' },
  { label: 'BIDV', value: 'BIDV' },
  { label: 'VietinBank', value: 'VietinBank' },
  { label: 'Techcombank', value: 'Techcombank' },
  { label: 'MB Bank', value: 'MB Bank' },
  { label: 'ACB', value: 'ACB' },
  { label: 'Sacombank', value: 'Sacombank' },
  { label: 'VPBank', value: 'VPBank' },
  { label: 'TPBank', value: 'TPBank' },
]
const banks = computed(() => [
  ...bankOptions,
  ...[
    ...new Set(
      props.beneficiaries.filter((item) => !item.internalAccountId).map((item) => item.bankName),
    ),
  ]
    .filter((name) => !bankOptions.some((bank) => bank.value === name))
    .map((name) => ({ label: name, value: name })),
])
const state = reactive<TransferDetails>(
  props.initial
    ? { ...props.initial }
    : {
        sourceAccountId: '',
        recipientType: 'OWN_ACCOUNT',
        destinationId: '',
        recipientNetwork: 'SAME_BANK',
        recipientAccountId: '',
        recipientName: '',
        bankName: '',
        amount: '',
        reference: '',
        saveRecipient: false,
      },
)

const accountNumberInput = strictNumericInput(/^\d*$/, () => state.recipientAccountId)

// An old draft may contain a recipient from the other network. Require a new choice.
if (
  state.savedBeneficiaryId &&
  !props.beneficiaries.some(
    (item) =>
      item.id === state.savedBeneficiaryId &&
      Boolean(item.internalAccountId) === (state.recipientNetwork === 'SAME_BANK'),
  )
)
  state.savedBeneficiaryId = ''

const savedRecipient = computed(() =>
  props.beneficiaries.find((item) => item.id === state.savedBeneficiaryId),
)
const savedOptions = computed(() =>
  props.beneficiaries
    .filter((item) => Boolean(item.internalAccountId) === (state.recipientNetwork === 'SAME_BANK'))
    .map((item) => ({
      value: item.id,
      label: item.displayName,
      description: `${item.bankName} · ${maskAccountNumber(item.accountNumber)}`,
    })),
)
const matchingContact = computed(() =>
  props.beneficiaries.find(
    (item) =>
      item.accountNumber === state.recipientAccountId.trim() &&
      item.bankName.toLowerCase() ===
        (state.recipientNetwork === 'SAME_BANK'
          ? 'raksul-bank'
          : state.bankName.trim().toLowerCase()),
  ),
)
function selectSaved(value: string | undefined) {
  state.savedBeneficiaryId = value || ''
  recipientError.value = ''
  form.value?.clear()
  if (!value && !state.recipientAccountId) fillDemoRecipient()
}

function fillDemoRecipient() {
  if (!props.demoDefaults || state.recipientType !== 'BENEFICIARY' || state.savedBeneficiaryId)
    return
  if (state.recipientNetwork === 'SAME_BANK') {
    state.recipientAccountId = DEMO_NEW_SAME_BANK_NUMBER
    return
  }
  state.recipientAccountId = DEMO_NEW_OTHER_BANK_RECIPIENT.accountNumber
  state.recipientName = DEMO_NEW_OTHER_BANK_RECIPIENT.displayName
  state.bankName = DEMO_NEW_OTHER_BANK_RECIPIENT.bankName
}

// Restored drafts always take precedence over demo defaults.
if (!props.initial) fillDemoRecipient()

const initialRecipient = props.beneficiaries.find((item) => item.id === state.destinationId)
if (state.recipientType === 'BENEFICIARY' && !state.savedBeneficiaryId && initialRecipient) {
  state.recipientNetwork = initialRecipient.internalAccountId ? 'SAME_BANK' : 'OTHER_BANK'
  state.recipientAccountId ||= initialRecipient.accountNumber
  state.recipientName ||= initialRecipient.displayName
  state.bankName ||= initialRecipient.internalAccountId ? '' : initialRecipient.bankName
  if (initialRecipient.internalAccountId) checkedRecipient.value = initialRecipient
}
if (
  !checkedRecipient.value &&
  state.recipientNetwork === 'SAME_BANK' &&
  state.verifiedAccountNumber === state.recipientAccountId.trim() &&
  state.recipientName
) {
  checkedRecipient.value = {
    displayName: state.recipientName,
    accountNumber: state.verifiedAccountNumber,
    bankName: 'Raksul-bank',
    currency: 'USD',
  }
}

watch(state, () => emit('change', { ...state }), { flush: 'sync' })
const schema = computed(() => transferDetailsSchema(props.accounts, props.beneficiaries))
const accountIdReady = computed(() => /^\d{8,20}$/.test(state.recipientAccountId.trim()))
const source = computed(() =>
  props.accounts.find((account) => account.id === state.sourceAccountId),
)
const sources = computed(() =>
  props.accounts.map((account) => ({
    label: `${account.displayName} · ${maskAccountNumber(account.accountNumber)}${account.status === 'FROZEN' ? ' · Frozen' : ''}`,
    value: account.id,
    disabled: account.status !== 'ACTIVE',
  })),
)
const ownDestinations = computed(() =>
  props.accounts
    .filter(
      (account) =>
        account.id !== source.value?.id &&
        account.status === 'ACTIVE' &&
        account.currency === source.value?.currency,
    )
    .map((account) => ({
      label: `${account.displayName} · ${maskAccountNumber(account.accountNumber)}`,
      value: account.id,
    })),
)

watch(
  () => [state.sourceAccountId, state.recipientType],
  () => {
    state.verifiedAccountNumber = ''
    state.destinationId = ''
    checkedRecipient.value = undefined
    recipientError.value = ''
  },
)
watch(
  () => state.recipientType,
  () => {
    if (!state.recipientAccountId) fillDemoRecipient()
  },
)
watch(
  () => state.recipientNetwork,
  () => {
    state.savedBeneficiaryId = ''
    form.value?.clear()
    state.verifiedAccountNumber = ''
    state.destinationId = ''
    state.recipientAccountId = ''
    state.recipientName = ''
    state.bankName = ''
    checkedRecipient.value = undefined
    recipientError.value = ''
    fillDemoRecipient()
  },
)
watch(
  () => state.recipientAccountId,
  () => {
    if (state.recipientNetwork !== 'SAME_BANK') return
    state.verifiedAccountNumber = ''
    state.destinationId = ''
    state.recipientName = ''
    checkedRecipient.value = undefined
    recipientError.value = ''
  },
)

async function checkAccount() {
  if (checking.value) return
  const number = state.recipientAccountId.trim()
  checkedRecipient.value = undefined
  state.destinationId = ''
  state.verifiedAccountNumber = ''
  state.recipientName = ''
  recipientError.value = ''
  form.value?.clear(/recipientAccountId|destinationId/)
  if (!/^\d{8,20}$/.test(number)) {
    recipientError.value = 'Enter an account number with 8–20 digits.'
    return
  }
  checking.value = true
  try {
    const recipient = await api.lookupRecipient(number)
    if (
      state.recipientNetwork !== 'SAME_BANK' ||
      state.recipientAccountId.trim() !== number ||
      state.savedBeneficiaryId
    )
      return
    checkedRecipient.value = recipient
    state.destinationId =
      props.beneficiaries.find((item) => item.internalAccountId && item.accountNumber === number)
        ?.id ?? ''
    state.recipientName = recipient.displayName
    state.verifiedAccountNumber = number
  } catch (error) {
    if (state.recipientNetwork === 'SAME_BANK' && state.recipientAccountId.trim() === number)
      recipientError.value =
        error instanceof Error ? error.message : 'Could not check this account. Try again.'
  } finally {
    checking.value = false
  }
}

function review() {
  recipientError.value = ''
  emit('review', prepareTransfer({ ...state }, props.accounts, props.beneficiaries))
}

async function focusError(event: { errors: { id?: string }[] }) {
  await nextTick()
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}
</script>

<template>
  <UForm
    ref="form"
    :loading-auto="false"
    :schema="schema"
    :state="state"
    :validate-on="['blur', 'input']"
    class="space-y-5"
    @submit="review"
    @error="focusError"
  >
    <div class="grid gap-5 md:grid-cols-2">
      <UFormField label="From account" name="sourceAccountId" required>
        <USelect
          v-model="state.sourceAccountId"
          :items="sources"
          placeholder="Choose an account"
          class="w-full"
          size="lg"
        />
        <p v-if="source" class="mt-2 flex items-baseline gap-1.5 text-sm text-muted">
          <span>Available</span>
          <MoneyDisplay
            :amount-minor="source.balanceMinor"
            class="font-semibold text-highlighted"
          />
          <span class="text-xs">USD</span>
        </p>
      </UFormField>

      <UFormField label="Transfer to" name="recipientType">
        <URadioGroup
          v-model="state.recipientType"
          :items="[
            { label: 'My accounts', value: 'OWN_ACCOUNT' },
            { label: 'Someone else', value: 'BENEFICIARY' },
          ]"
          orientation="horizontal"
          variant="card"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      v-if="state.recipientType === 'OWN_ACCOUNT'"
      label="To account"
      name="destinationId"
      required
    >
      <USelect
        v-model="state.destinationId"
        :items="ownDestinations"
        :disabled="!source"
        placeholder="Choose an account"
        class="w-full"
        size="lg"
      />
      <p v-if="source && ownDestinations.length === 0" class="mt-2 text-sm text-muted">
        No eligible accounts are available for this transfer.
      </p>
    </UFormField>

    <div
      v-else
      class="space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.025] p-4 sm:p-5"
    >
      <UFormField label="Recipient bank" name="recipientNetwork">
        <URadioGroup
          v-model="state.recipientNetwork"
          :items="[
            { label: 'Same bank', description: 'Raksul-bank account', value: 'SAME_BANK' },
            { label: 'Other bank', description: 'Domestic bank account', value: 'OTHER_BANK' },
          ]"
          orientation="horizontal"
          variant="card"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Saved recipient" name="savedBeneficiaryId" hint="Optional">
        <USelectMenu
          aria-label="Saved recipient"
          :model-value="state.savedBeneficiaryId || undefined"
          :items="savedOptions"
          value-key="value"
          :filter-fields="['label', 'description']"
          :search-input="{ placeholder: 'Search name, bank or last 4 digits' }"
          placeholder="Choose a saved recipient"
          class="w-full"
          size="lg"
          @update:model-value="selectSaved"
        >
          <template #empty>No saved recipients match your search.</template>
        </USelectMenu>
        <p v-if="!savedOptions.length" class="mt-2 text-sm text-muted">
          No saved recipients for this bank network. Enter a recipient below.
        </p>
      </UFormField>
      <div v-if="state.savedBeneficiaryId" class="space-y-3">
        <p v-if="savedRecipient" role="status" class="text-sm text-muted">
          {{ savedRecipient.bankName }} · {{ maskAccountNumber(savedRecipient.accountNumber) }}
        </p>
        <UButton color="neutral" variant="outline" @click="selectSaved(undefined)">
          Enter a new recipient
        </UButton>
      </div>
      <template v-else>
        <p class="text-sm text-muted">Or enter a recipient</p>
        <p v-if="demoDefaults" class="text-xs text-muted">
          Demo account details are prefilled when you choose a bank network. You can edit them.
        </p>

        <div :class="state.recipientNetwork === 'OTHER_BANK' ? 'grid gap-4 md:grid-cols-2' : ''">
          <UFormField
            v-if="state.recipientNetwork === 'OTHER_BANK'"
            label="Bank"
            name="bankName"
            required
          >
            <USelect
              v-model="state.bankName"
              :items="banks"
              placeholder="Choose a bank"
              class="w-full"
              size="lg"
            />
          </UFormField>

          <UFormField
            label="Account number"
            name="recipientAccountId"
            required
            :error="recipientError || undefined"
          >
            <div class="flex flex-col gap-3 sm:flex-row">
              <UInput
                v-model="state.recipientAccountId"
                inputmode="numeric"
                autocomplete="off"
                :maxlength="20"
                placeholder="Enter 8–20 digits"
                class="min-w-0 flex-1"
                size="lg"
                @beforeinput="accountNumberInput.beforeinput"
                @input.capture="accountNumberInput.input"
              />
              <UButton
                v-if="state.recipientNetwork === 'SAME_BANK'"
                type="button"
                color="neutral"
                variant="outline"
                size="lg"
                icon="i-lucide-search"
                class="justify-center"
                :disabled="!accountIdReady || checking"
                :loading="checking"
                @click="checkAccount"
              >
                Check account
              </UButton>
            </div>
          </UFormField>
        </div>

        <div
          v-if="checkedRecipient"
          role="status"
          class="flex items-center gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10">
            <UIcon name="i-lucide-badge-check" class="size-5 text-success" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-highlighted">
              {{ checkedRecipient.displayName }}
            </p>
            <p class="text-sm text-muted">Verified Raksul-bank account</p>
          </div>
        </div>

        <UFormField
          v-if="state.recipientNetwork === 'OTHER_BANK'"
          label="Account holder name"
          name="recipientName"
          required
        >
          <UInput
            v-model="state.recipientName"
            placeholder="Enter the name on the account"
            :maxlength="80"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UCheckbox
          v-if="!matchingContact && (state.recipientNetwork === 'OTHER_BANK' || checkedRecipient)"
          v-model="state.saveRecipient"
          label="Save recipient for next time"
          description="Saved only after a successful transfer."
        />
        <p v-else-if="matchingContact" class="text-sm text-muted">
          This recipient is already saved.
        </p>
      </template>
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <UFormField label="Amount" name="amount" required>
        <MoneyInput v-model="state.amount" :show-error="false" />
      </UFormField>
      <UFormField label="Reference" name="reference" hint="Optional">
        <UInput
          v-model="state.reference"
          placeholder="What's this for?"
          :maxlength="140"
          class="w-full"
        />
      </UFormField>
    </div>
    <div
      class="flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
        Review before money moves
      </p>
      <UButton type="submit" size="lg" class="justify-center" trailing-icon="i-lucide-arrow-right">
        Review transfer
      </UButton>
    </div>
  </UForm>
</template>
