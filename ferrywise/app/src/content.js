'use strict';
// All landing-page copy as data. Ferrywise is coming, not built; nothing is for sale.

(function () {
const headlines = {
  A: 'One flat price. No credits, no runtime meter.',
  B: 'Stop retyping client details: Ferrywise will copy them between sites'
};

const subheadline =
  'Ferrywise will capture client details on one website and let you preview the fill on another. One flat price: no credits, no meter.';

const notice =
  'Ferrywise is an unreleased prototype and is not built yet. Nothing is for sale today: reserving a plan only records, in this browser, which plan you would want, and you will not be charged.';

const ctaNote = 'No card needed. Nothing is for sale yet.';

const pricingNote = 'Planned prices. They could change before launch. No free tier is planned.';

const features = [
  'Will capture client details on one site with a click',
  'Will preview the fill on another site before anything is entered',
  'Will keep one flat price, with no credits and no usage meter',
  'Coming: a review step so you approve each fill before it is submitted'
];

const problems = [
  'You retype the same client details into portals every week.',
  'Copying data between tabs eats billable hours.',
  'One wrong paste into a client form means rework later.'
];

const includes = {
  solo: ['Unlimited fills, no credits', 'One user'],
  solo_annual: ['Unlimited fills, no credits', 'One user', 'Two months free vs monthly'],
  team: ['Unlimited fills, no credits', 'Shared client details', 'Up to 5 users']
};

const faq = [
  { q: 'Can I buy Ferrywise today?', a: 'No. Ferrywise is not built yet and nothing is for sale. The buttons only register interest.' },
  { q: 'Will I be charged when I reserve?', a: 'No. We do not take payment details, and nothing you enter leaves your browser.' },
  { q: 'Is there a free plan?', a: 'No free plan is planned. Pricing shown is what we are testing.' },
  { q: 'When will it launch?', a: 'Coming only if enough people show interest. There is no launch date.' }
];

const waitlistNote =
  'Register your interest. It is saved only in this browser and is not sent to us, and nothing is for sale yet.';

const workflowQuestion = 'What repeat task would you automate first?';

const tiers = [
  { id: 'solo', name: 'Solo', price: 9, period: 'month', label: 'Reserve Solo at $9/month' },
  { id: 'solo_annual', name: 'Solo Annual', price: 90, period: 'year', label: 'Reserve Solo Annual at $90/year' },
  { id: 'team', name: 'Team', price: 29, period: 'month', label: 'Reserve Team at $29/month' }
];

const api = { headlines, subheadline, notice, ctaNote, pricingNote, includes, features, problems, faq, waitlistNote, workflowQuestion, tiers };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.FerrywiseContent = api; // plain <script> use in the browser
})();
