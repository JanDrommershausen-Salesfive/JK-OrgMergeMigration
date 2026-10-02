import { describe, expect, it } from 'vitest';
import { parseRunScript } from './runConfig';

const script = `
SOURCE_ALIAS="us-prod"
TARGET_ALIAS="CDEV5"
EXPECTED_SOURCE_ID="00DDn000006CppDMAS"
EXPECTED_TARGET_ID="00D9K00000KSJIxUAP"
PROD_ORG_IDS=("00DDn000006CppDMAS" "00D7Q00000Ch276UAB")
`;

describe('parseRunScript', () => {
    it('liest Aliase, Org-IDs und geschützte Orgs', () => {
        expect(parseRunScript(script)).toEqual({
            sourceAlias: 'us-prod',
            targetAlias: 'CDEV5',
            expectedSourceId: '00DDn000006CppDMAS',
            expectedTargetId: '00D9K00000KSJIxUAP',
            protectedOrgIds: ['00DDn000006CppDMAS', '00D7Q00000Ch276UAB']
        });
    });
});
