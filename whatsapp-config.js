// Centralized WhatsApp Field Room configuration.
// Update WHATSAPP_BASE_URL here to change the destination across the whole site.
(function () {
  var WHATSAPP_BASE_URL = 'https://www.covomultipliers.com/join-whatsapp';

  window.CovoWhatsApp = {
    url: function (utmSource, utmMedium, utmCampaign) {
      utmMedium = utmMedium || 'cta';
      utmCampaign = utmCampaign || 'whatsapp_field_room';
      return (
        WHATSAPP_BASE_URL +
        '?utm_source=' + encodeURIComponent(utmSource) +
        '&utm_medium=' + encodeURIComponent(utmMedium) +
        '&utm_campaign=' + encodeURIComponent(utmCampaign)
      );
    },
  };
}());
