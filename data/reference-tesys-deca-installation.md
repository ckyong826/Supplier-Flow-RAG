# TeSys Deca contactor instruction-sheet reference

Source: Schneider Electric, [TeSys Deca Contactors Instruction Sheet](https://www.se.com/us/en/download/document/BQT61825/), document BQT61825.

This reference digest explains how to use an instruction sheet when discussing TeSys Deca contactors. It is not a SupplierFlow price, stock, delivery, warranty or field-installation approval. The manufacturer instruction and the exact contactor variant control the work.

Quick answer: BQT61825 is the TeSys Deca contactor instruction sheet. It does not make every LC1D variant share identical terminal wiring; use the exact variant and terminal diagram.

## Instruction sheet versus catalogue

The TeSys Deca catalogue helps select a contactor family and compare ratings. The BQT61825 instruction sheet is a separate installation reference for TeSys Deca contactors. It should be used for mounting, connection, operating orientation, terminal identification and safety information.

A catalogue statement such as “TeSys Deca contactor” does not prove that every Deca variant has identical terminal markings or connection steps. Coil type, contactor frame, connection technology and accessory arrangement can change the installation details.

## Identify the exact device

Before wiring, record the full commercial reference and compare it with the instruction sheet. Similar LC1D codes can differ in coil voltage, auxiliary contacts, connection arrangement or suppression. The last characters of a SKU are not optional decoration.

A 1NO + 1NC auxiliary arrangement describes control contacts. It does not identify the A1/A2 coil terminals, the main power terminals, the AC-1 or AC-3 current, or the short-circuit coordination. Those fields must be retrieved separately.

## Main and control circuits

The contactor’s main circuit switches the load. The coil circuit commands the contactor. Auxiliary contacts provide status or interlock signals. An overload relay can open the control circuit during an overload, while an upstream protective device handles short-circuit protection.

Keeping these circuits separate prevents common answers from becoming unsafe. “The contactor has 1NO + 1NC” is not a complete statement about motor protection. “The coil is 24 V” is not a statement about the motor’s operating voltage.

## Connection technology

The current TeSys range includes different connection technologies and the catalogue identifies SNAP IN solutions for some motor-starter applications. The presence of a tool-less or spring connection feature does not mean that the terminals can be wired without the specified conductor preparation, stripping length, insertion direction or verification step.

Use the installation sheet for the exact connection process. Do not copy a screw-terminal procedure to a spring-terminal product or assume that two visually similar contactors share the same terminal accessory.

## Coil and suppression

The control coil may be AC or DC depending on the exact reference. DC coils can be polarity-sensitive when an integral suppression circuit is present. A coil’s A1/A2 marking, supply type and suppression arrangement must be checked before energising.

Never answer “either polarity is fine” from the contactor family name alone. If the source identifies a polarity rule or suppression device, quote that rule for the exact variant. If the exact coil information is missing, state the limitation.

## Mounting and maintenance

The instruction sheet is the place to confirm mounting orientation, rail or panel attachment, clearances and removal procedure. Maintenance also includes isolation, inspection of connections, checking contact condition and confirming that auxiliary accessories remain correctly fitted.

A QR code, label or visual contact indicator can help identify a device, but none replaces electrical isolation and verification. A contactor that is mechanically in the OFF position can still have an energised supply terminal.

## Safe customer response

For “how do I install this TeSys Deca?”, provide the instruction-sheet reference and ask for the full SKU. For “what is the rating?”, use the catalogue or product row. For “does 1NO + 1NC mean it can switch my motor?”, answer no: auxiliary contact count alone does not establish the motor-duty rating.

The source supports installation guidance and evidence routing. It does not establish SupplierFlow commercial fields or a universal wiring method for every TeSys Deca variant.
