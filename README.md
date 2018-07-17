# asn1exp

ASN.1 expanded module parser. This is not a universal parser. It was specifically made for parsing Expanded ASN.1 modules for Mobile Application Part (MAP) (3GPP TS 29.002) found at http://www.3gpp.org/ftp/specs/archive/29_series/29.002/ASN.1/. It will most likely not work for other expanded ASN.1 modules.

Everything except OPERATION and ERROR definitions are skipped. For example, the following definition:

```
updateLocation OPERATION  ::=  {
   ARGUMENT     SEQUENCE {
      imsi                          OCTET STRING ( SIZE( 3 .. 8 ) ),
      msc-Number                    [1] IMPLICIT OCTET STRING ( SIZE( 1 .. 20 ) ) ( SIZE( 1 .. 9 ) ),
      vlr-Number                    OCTET STRING ( SIZE( 1 .. 20 ) ) ( SIZE( 1 .. 9 ) ),
      lmsi                          [10] IMPLICIT OCTET STRING ( SIZE( 4 ) ) OPTIONAL,
      ...
```

will be parsed as the object:

```
{
  "operations": {
    "updateLocation": {
      "argument": {
        "type": "SEQUENCE",
        "elements": [
          { "name": "imsi", "type": "OCTET STRING", "qualifiers": "(SIZE(3..8))" },
          { "name": "msc-Number", "tag": 1, "implicit": true, "type": "OCTET STRING", "qualifiers": "(SIZE(1..9))" },
          { "name": "vlr-Number", "type": "OCTET STRING", "qualifiers": "(SIZE(1..9))" },
          { "name": "lmsi", "tag": 10, "implicit": true, "type": "OCTET STRING", "qualifiers": "(SIZE(4))", "optional": true },
          ...
```

## Usage

```
const asn1exp = require('asn1exp');

const parsed = asn1exp.parse(expanded_asn1_string);
```
