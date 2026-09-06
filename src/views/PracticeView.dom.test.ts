import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PracticeView from './PracticeView.vue'

describe('PracticeView', () => {
  it('renders the mode it was routed with', () => {
    const wrapper = mount(PracticeView, { props: { mode: 'learn' } })
    expect(wrapper.text()).toContain('learn')
  })
})
