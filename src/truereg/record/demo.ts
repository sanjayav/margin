// ───────────────────────────────────────────────────────────────────────────
// A SEEDED INSTALLATION — one integrated Chinese mill, one reporting period.
//
// Fictional operator and works; the shape is the real thing. It is deliberately
// NOT a clean dataset, because a clean dataset would demonstrate nothing:
//
//   • one process unit whose name matches two Annex III routes equally, which
//     the boundary agent must escalate rather than resolve;
//   • one unit no route recognises at all;
//   • purchased pig iron with no supplier declaration, so the precursor agent
//     has a real chase and the delta has a real hole;
//   • a China national ETS payment the mill genuinely makes and that Article 9
//     does not currently credit;
//   • documents still unstructured, so the intake queue is not empty.
//
// Every quantity carries its own data quality, because the difference between a
// measured and an estimated tonne is the difference between a verification that
// passes and one that does not.
// ───────────────────────────────────────────────────────────────────────────
import type { RecordBundle, SalesContract } from './types.js'

const doc = (id: string, kind: RecordBundle['documents'][number]['kind'], title: string, titleLocal: string, structured: boolean, pages = 12): RecordBundle['documents'][number] =>
  ({ id, kind, title, titleLocal, language: 'zh-CN', periodFrom: '2026-01-01', periodTo: '2026-12-31', structured, pages })

export const DEMO_BUNDLE: RecordBundle = {
  operator: {
    id: 'op-bohai', name: 'Bohai United Steel Co., Ltd', nameLocal: '渤海联合钢铁有限公司', country: 'CN',
    identifiers: { USCC: '91130200MA0XXXXXXX' },
  },
  installation: {
    id: 'inst-cfd', operatorId: 'op-bohai', name: 'Caofeidian Works', nameLocal: '曹妃甸厂区',
    country: 'CN', lat: 39.0, lon: 118.5,
  },
  period: { id: 'per-2026', installationId: 'inst-cfd', from: '2026-01-01', to: '2026-12-31' },

  processUnits: [
    { id: 'pu-sinter', installationId: 'inst-cfd', localName: '3#烧结机', name: 'No.3 sinter strand', describedFunction: '铁矿粉烧结，供高炉入炉料', feeds: ['pu-bf'] },
    { id: 'pu-bf', installationId: 'inst-cfd', localName: '2#高炉', name: 'No.2 blast furnace', describedFunction: '炼铁，产出铁水送转炉', feeds: ['pu-bof'] },
    { id: 'pu-bof', installationId: 'inst-cfd', localName: '1#转炉', name: 'No.1 basic oxygen converter', describedFunction: '铁水吹炼成钢，连铸成板坯', feeds: ['pu-hsm'] },
    // Deliberately ambiguous: 炼钢 points at the converter shop, 电炉 at an arc
    // furnace. The two routes attribute a coal footprint and a grid footprint
    // respectively, so guessing is not an option.
    { id: 'pu-amb', installationId: 'inst-cfd', localName: '2#炼钢电炉', describedFunction: '车间备注不全', feeds: [] },
    // No route recognises a lime kiln. It may be inside the boundary as a
    // process emission source, or it may serve another site entirely.
    { id: 'pu-lime', installationId: 'inst-cfd', localName: '3#石灰窑', describedFunction: '石灰石煅烧', feeds: ['pu-bof'] },
    { id: 'pu-hsm', installationId: 'inst-cfd', localName: '1450热轧带钢厂', name: '1450 hot strip mill', describedFunction: '板坯加热轧制成热轧卷板', feeds: [] },
  ],

  energyFlows: [
    { id: 'ef-sinter-coke', processUnitId: 'pu-sinter', carrier: 'coal', carrierLocal: '燃料煤', amount: { value: 168_000, unit: 't', quality: 'measured', uncertainty: 0.02, sourceRef: 'WB-2026-SNT' }, purchased: true, documentIds: ['d-inv-coal'] },
    { id: 'ef-sinter-elec', processUnitId: 'pu-sinter', carrier: 'electricity', carrierLocal: '电力', amount: { value: 92_000, unit: 'MWh', quality: 'measured', uncertainty: 0.015, sourceRef: 'MTR-SNT-01' }, purchased: true, documentIds: ['d-inv-elec'] },
    { id: 'ef-bf-coke', processUnitId: 'pu-bf', carrier: 'coke', carrierLocal: '焦炭', amount: { value: 782_000, unit: 't', quality: 'measured', uncertainty: 0.02, sourceRef: 'WB-2026-BF-CK' }, purchased: true, documentIds: ['d-inv-coke', 'd-lab-coke'] },
    { id: 'ef-bf-pci', processUnitId: 'pu-bf', carrier: 'coal', carrierLocal: '喷吹煤', amount: { value: 191_000, unit: 't', quality: 'measured', uncertainty: 0.025, sourceRef: 'WB-2026-BF-PCI' }, purchased: true, documentIds: ['d-inv-coal'] },
    { id: 'ef-bf-elec', processUnitId: 'pu-bf', carrier: 'electricity', carrierLocal: '电力', amount: { value: 138_000, unit: 'MWh', quality: 'measured', sourceRef: 'MTR-BF-01' }, purchased: true, documentIds: ['d-inv-elec'] },
    { id: 'ef-bof-elec', processUnitId: 'pu-bof', carrier: 'electricity', carrierLocal: '电力', amount: { value: 124_000, unit: 'MWh', quality: 'measured', sourceRef: 'MTR-BOF-01' }, purchased: true, documentIds: ['d-inv-elec'] },
    { id: 'ef-hsm-gas', processUnitId: 'pu-hsm', carrier: 'coke-oven-gas', carrierLocal: '焦炉煤气', amount: { value: 120_400, unit: 'km³', quality: 'calculated', uncertainty: 0.06, sourceRef: 'GAS-HSM-2026' }, ncv: { value: 17.6, unit: 'GJ/km³', quality: 'measured' }, purchased: false, documentIds: ['d-log-hsm'] },
    { id: 'ef-hsm-elec', processUnitId: 'pu-hsm', carrier: 'electricity', carrierLocal: '电力', amount: { value: 312_000, unit: 'MWh', quality: 'measured', sourceRef: 'MTR-HSM-01' }, purchased: true, documentIds: ['d-inv-elec'] },
  ],

  materialFlows: [
    { id: 'mf-bf-sinter', processUnitId: 'pu-bf', direction: 'in', material: 'sinter', materialLocal: '烧结矿', amount: { value: 2_848_000, unit: 't', quality: 'measured', sourceRef: 'WB-2026-BF-SN' }, documentIds: ['d-log-bf'] },
    { id: 'mf-bof-hm', processUnitId: 'pu-bof', direction: 'in', material: 'hot metal', materialLocal: '铁水', amount: { value: 2_012_000, unit: 't', quality: 'measured', sourceRef: 'WB-2026-BOF-HM' }, documentIds: ['d-log-bof'] },
    // Purchased pig iron — bought in when the blast furnace was down for reline.
    // No supplier declaration yet: this is the precursor agent's live chase.
    { id: 'mf-bof-pi', processUnitId: 'pu-bof', direction: 'in', material: 'pig iron', materialLocal: '外购生铁', amount: { value: 95_000, unit: 't', quality: 'measured', sourceRef: 'PO-2026-0417' }, supplierId: 'sup-neimeng', classification: { scheme: 'CN', code: '7201' }, documentIds: ['d-po-pigiron'] },
    { id: 'mf-bof-scrap', processUnitId: 'pu-bof', direction: 'in', material: 'steel scrap', materialLocal: '废钢', amount: { value: 218_000, unit: 't', quality: 'measured', sourceRef: 'WB-2026-BOF-SC' }, documentIds: ['d-log-bof'] },
    { id: 'mf-hsm-slab', processUnitId: 'pu-hsm', direction: 'in', material: 'slab', materialLocal: '连铸板坯', amount: { value: 1_702_000, unit: 't', quality: 'measured', sourceRef: 'WB-2026-HSM-SL' }, documentIds: ['d-log-hsm'] },
    { id: 'mf-hsm-slab-buy', processUnitId: 'pu-hsm', direction: 'in', material: 'slab', materialLocal: '外购板坯', amount: { value: 148_000, unit: 't', quality: 'measured', sourceRef: 'PO-2026-0522' }, supplierId: 'sup-lunan', classification: { scheme: 'CN', code: '7207' }, documentIds: ['d-po-slab'] },
  ],

  directEmissions: [
    { id: 'de-sinter', processUnitId: 'pu-sinter', category: 'combustion and process', amount: { value: 594_000, unit: 'tCO2e', quality: 'calculated', uncertainty: 0.035, sourceRef: 'GHG-2026-SNT' }, method: 'calculation', documentIds: ['d-log-sinter'] },
    { id: 'de-bof', processUnitId: 'pu-bof', category: 'process (flux, carbon)', amount: { value: 201_000, unit: 'tCO2e', quality: 'calculated', uncertainty: 0.05, sourceRef: 'GHG-2026-BOF' }, method: 'mass-balance', documentIds: ['d-log-bof'] },
  ],

  products: [
    { id: 'pr-sinter', installationId: 'inst-cfd', name: 'Sinter', nameLocal: '烧结矿', classification: [{ scheme: 'internal', code: 'SNT' }], processUnitIds: ['pu-sinter'], output: { value: 2_902_000, unit: 't', quality: 'measured', sourceRef: 'PROD-2026-SNT' } },
    { id: 'pr-hm', installationId: 'inst-cfd', name: 'Hot metal (pig iron)', nameLocal: '铁水（生铁）', classification: [{ scheme: 'CN', code: '7201', description: 'Pig iron and spiegeleisen' }], processUnitIds: ['pu-bf'], output: { value: 2_048_000, unit: 't', quality: 'measured', sourceRef: 'PROD-2026-BF' } },
    { id: 'pr-slab', installationId: 'inst-cfd', name: 'Continuously cast slab', nameLocal: '连铸板坯', classification: [{ scheme: 'CN', code: '7207', description: 'Semi-finished products of iron or non-alloy steel' }], processUnitIds: ['pu-bof'], output: { value: 2_178_000, unit: 't', quality: 'measured', sourceRef: 'PROD-2026-BOF' }, composition: [{ constituent: 'Fe', massFraction: 0.985 }, { constituent: 'C', massFraction: 0.0018 }], recycledContentFraction: 0.10 },
    { id: 'pr-hrc', installationId: 'inst-cfd', name: 'Hot-rolled coil', nameLocal: '热轧卷板', classification: [{ scheme: 'CN', code: '7208', description: 'Flat-rolled products of iron or non-alloy steel, hot-rolled' }], processUnitIds: ['pu-hsm'], output: { value: 1_764_000, unit: 't', quality: 'measured', sourceRef: 'PROD-2026-HSM' }, composition: [{ constituent: 'Fe', massFraction: 0.984 }, { constituent: 'Mn', massFraction: 0.006 }], recycledContentFraction: 0.09 },
  ],

  documents: [
    doc('d-log-sinter', 'process-log', 'Sinter plant daily operating log 2026', '3#烧结机2026年运行日志', true, 366),
    doc('d-log-bf', 'process-log', 'No.2 blast furnace charge and tap log 2026', '2#高炉装料与出铁记录2026', true, 366),
    doc('d-log-bof', 'process-log', 'Converter heat records 2026', '1#转炉炉次记录2026', true, 402),
    doc('d-log-hsm', 'process-log', 'Hot strip mill reheat furnace log 2026', '热轧加热炉运行日志2026', false, 288),
    doc('d-inv-elec', 'energy-invoice', 'Grid electricity invoices Jan–Dec 2026', '电费发票 2026年1–12月', true, 24),
    doc('d-inv-coke', 'energy-invoice', 'Coke purchase invoices 2026', '焦炭采购发票2026', true, 61),
    doc('d-inv-coal', 'energy-invoice', 'Coal purchase invoices 2026', '煤炭采购发票2026', false, 74),
    doc('d-lab-coke', 'lab-report', 'Coke carbon content and NCV analyses 2026', '焦炭碳含量与低位发热量分析2026', true, 48),
    doc('d-po-pigiron', 'purchase-contract', 'Pig iron purchase contract PO-2026-0417', '生铁采购合同 PO-2026-0417', true, 6),
    doc('d-po-slab', 'purchase-contract', 'Slab purchase contract PO-2026-0522', '板坯采购合同 PO-2026-0522', true, 8),
    doc('d-sup-lunan', 'supplier-declaration', 'Lunan Special Steel embedded emissions declaration', '鲁南特钢隐含排放声明', true, 4),
    // Note what is NOT here: no meter-calibration document set. That single
    // absence is the most common first-verification finding in the industry.
  ],

  carbonPricesPaid: [
    {
      id: 'cp-cnets', scheme: 'China national ETS (全国碳排放权交易市场)', jurisdiction: 'CN',
      amount: { value: 8_420_000, unit: 'CNY', quality: 'measured', sourceRef: 'ETS-2026-SETTLE' }, currency: 'CNY',
      unitsSurrendered: { value: 142_000, unit: 'tCO2e', quality: 'measured' },
      freeAllocation: { value: 1_186_000, unit: 'tCO2e', quality: 'measured' },
      documentIds: [],
    },
  ],

  supplierDeclarations: [
    {
      id: 'sd-lunan', supplierId: 'sup-lunan', supplierName: 'Lunan Special Steel', supplierNameLocal: '鲁南特钢',
      supplierCountry: 'CN', material: 'slab', classification: { scheme: 'CN', code: '7207' },
      received: { value: 148_000, unit: 't', quality: 'measured' },
      declaredIntensity: { value: 2.10, unit: 'tCO2e/t', quality: 'supplier-declared' },
      status: 'received', requestedOn: '2026-11-04', documentIds: ['d-sup-lunan'],
    },
    {
      id: 'sd-neimeng', supplierId: 'sup-neimeng', supplierName: 'Northern Foundry Iron', supplierNameLocal: '北方铸铁',
      supplierCountry: 'CN', material: 'pig iron', classification: { scheme: 'CN', code: '7201' },
      received: { value: 95_000, unit: 't', quality: 'measured' },
      status: 'requested', requestedOn: '2026-12-18', documentIds: ['d-po-pigiron'],
    },
  ],
}

export const DEMO_CONTRACTS: SalesContract[] = [
  { id: 'ct-nordstahl', productId: 'pr-hrc', buyerName: 'Nordstahl Handel GmbH', buyerCountry: 'DE', buyerIdentifiers: { EORI: 'DE517402881996314' }, tonnes: 42_000, deliveryFrom: '2026-03-01', deliveryTo: '2026-12-15', incoterm: 'CIF Hamburg', pricePerTonne: 618, currency: 'EUR' },
  { id: 'ct-ponente', productId: 'pr-hrc', buyerName: 'Acciai Ponente S.p.A.', buyerCountry: 'IT', buyerIdentifiers: { EORI: 'IT09214470158' }, tonnes: 28_500, deliveryFrom: '2026-02-10', deliveryTo: '2026-11-30', incoterm: 'CIF Genoa', pricePerTonne: 604, currency: 'EUR' },
  { id: 'ct-benelux', productId: 'pr-hrc', buyerName: 'Benelux Metaal B.V.', buyerCountry: 'NL', buyerIdentifiers: { EORI: 'NL812446690B01' }, tonnes: 18_000, deliveryFrom: '2026-05-01', deliveryTo: '2026-12-20', incoterm: 'CIF Rotterdam', pricePerTonne: 611, currency: 'EUR' },
  { id: 'ct-slab-es', productId: 'pr-slab', buyerName: 'Ibérica Laminados S.L.', buyerCountry: 'ES', buyerIdentifiers: { EORI: 'ESB86420137' }, tonnes: 31_000, deliveryFrom: '2026-04-01', deliveryTo: '2026-10-31', incoterm: 'CIF Bilbao', pricePerTonne: 512, currency: 'EUR' },
  // The UK contract is why the second regime pays for itself: the same verified
  // dataset, a different mechanism, near-zero incremental collection.
  { id: 'ct-severn', productId: 'pr-hrc', buyerName: 'Severn Steel Stockholders Ltd', buyerCountry: 'GB', buyerIdentifiers: { EORI: 'GB428106753000' }, tonnes: 11_000, deliveryFrom: '2027-01-15', deliveryTo: '2027-09-30', incoterm: 'CIF Newport', pricePerTonne: 629, currency: 'EUR' },
]
