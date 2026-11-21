/**
 * Shared Merchant listings policies for Google Product Offer / Organization markup.
 * Business rules: free Minsk pickup; 30-day in-store return at the office.
 */

export function getMerchantReturnPolicy(origin: string) {
  return {
    "@type": "MerchantReturnPolicy" as const,
    "@id": `${origin}/#return-policy`,
    applicableCountry: "BY",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 30,
    returnMethod: "https://schema.org/ReturnInStore",
    returnFees: "https://schema.org/FreeReturn",
  };
}

export function getOfferShippingDetails(origin: string) {
  return {
    "@type": "OfferShippingDetails" as const,
    "@id": `${origin}/#shipping-policy`,
    shippingRate: {
      "@type": "MonetaryAmount" as const,
      value: 0,
      currency: "BYN",
    },
    shippingDestination: {
      "@type": "DefinedRegion" as const,
      addressCountry: "BY",
      addressLocality: "Минск",
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime" as const,
      handlingTime: {
        "@type": "QuantitativeValue" as const,
        minValue: 0,
        maxValue: 1,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue" as const,
        minValue: 0,
        maxValue: 0,
        unitCode: "DAY",
      },
    },
  };
}

/** Full copies for Offer (GSC reads product URL markup directly). */
export function getOfferMerchantPolicies(origin: string) {
  return {
    shippingDetails: getOfferShippingDetails(origin),
    hasMerchantReturnPolicy: getMerchantReturnPolicy(origin),
  };
}
