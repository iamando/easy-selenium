import {
	existsSync,
	isEmpty,
	join,
	jsPDF,
	nanoid,
	readJsonSync,
	writeJson,
	writeJsonSync,
} from '@deps'
import {
	generateFileName,
	getCurrentMonth,
	updateOrCreate,
} from '@pkg/utils.ts'
import { TDataResult, TDriverBrowser, TJSON } from '@pkg/types.ts'
import { getAverageDuration, getCoverage, getFlaky } from '@pkg/utils.ts'

const exportGeneratedLog = (
	{ results }: { results: Array<TDataResult> },
): void => {
	const dirPath = join(Deno.cwd(), 'drowser/logs')
	const hasDir = existsSync(dirPath)

	if (!hasDir) Deno.mkdirSync(dirPath, { recursive: true })

	const logFilename = generateFileName('drowser_log', 'log')
	const logFilePath = `${dirPath}/${logFilename}`

	if (Array.isArray(results) && results.length !== 0) {
		const logFileExists = existsSync(logFilePath)

		const writeResult = () =>
			results.forEach((r) => {
				const logRow = `[${r.timestamp}] - Test with ${r.name} is ${r.status}`
				Deno.writeTextFile(logFilePath, `${logRow}\n`, { append: true })
			})

		if (logFileExists) {
			writeResult()
			return
		}

		Deno.create(logFilePath).then(() => writeResult())
	}
}

const exportGeneratedPdf = (
	{ results }: { results: Array<TDataResult> },
): void => {
	const dirPath = join(Deno.cwd(), 'drowser/pdfs')
	const asDir = existsSync(dirPath)

	if (!asDir) Deno.mkdirSync(dirPath, { recursive: true })

	const pdfFilename = generateFileName('drowser_pdf', 'pdf')
	const pdfFilePath = `${dirPath}/${pdfFilename}`

	if (Array.isArray(results) && results.length > 0) {
		const pdf = new jsPDF()
		const pdfCopy = Object.assign({}, pdf) as any
		const head = [[
			'ID',
			'NAME',
			'STATUS',
			'TIMESTAMP',
		]]
		const body = results.map((
			r,
			i,
		) => [i + 1, r.name, r.status, r.timestamp])
		const tableOpts = { head, body, theme: 'grid' }

		pdf.setFontSize(18)
		pdf.text('Drowser Reports', 11, 8)
		pdf.setFontSize(11)
		pdf.setTextColor(100)

		pdfCopy.autoTable(tableOpts)

		pdf.save(pdfFilePath)
	}
}

const exportJSONReport = (
	{ results, browser }: {
		results: Array<TDataResult>
		browser: TDriverBrowser
	},
): void => {
	const filePath = join(Deno.cwd(), 'drowser-reports.json')
	const hasFile = existsSync(filePath)

	if (!hasFile) {
		Deno.createSync(filePath)
		writeJsonSync(filePath, {
			drowser: {
				metrics: {},
				cases: [],
			},
		}, { spaces: 2 })
	}

	if (Array.isArray(results) && results.length > 0) {
		const jsonData = readJsonSync(filePath) as TJSON

		const month = getCurrentMonth({ type: 'short' })

		if (isEmpty(jsonData?.drowser?.metadata?.current_month)) {
			jsonData.drowser.metadata = {
				current_month: month,
			}
		}

		const flatedTotalTests = jsonData.drowser.metadata.current_month === month
			? jsonData.drowser.cases.flatMap((item) => item.cases).filter((c) =>
				c.month_of_test === month
			)
			: []
		const totalTests = [
			...flatedTotalTests,
			...results,
		]

		const groupByStatus = Object.groupBy(
			totalTests,
			({ status }: { status: string }) => status,
		)

		const flakyTestsCount = jsonData.drowser.cases.filter((c) =>
			c.month_of_test === month
		).map((item) => item.flaky)
			.reduce(
				(acc, cur) => acc + cur,
				0,
			)

		jsonData.drowser.metadata = {
			current_month: month,
		}

		const CombinedTotalTests = [
			...jsonData.drowser.cases.flatMap((item) => item.cases),
			...results,
		]

		const CombinedGroupByStatus = Object.groupBy(
			CombinedTotalTests,
			({ status }: { status: string }) => status,
		)

		const CombinedTestCoverage = getCoverage({ results: CombinedTotalTests })

		const CombinedAvgTestDuration = getAverageDuration({
			results: CombinedTotalTests,
		})

		const CombinedFlakyTestsCount = jsonData.drowser.cases.map((item) =>
			item.flaky
		)
			.reduce(
				(acc, cur) => acc + cur,
				0,
			)

		jsonData.drowser.metrics = {
			total_tests: CombinedTotalTests.length ?? 0,
			passing_tests: CombinedGroupByStatus?.passed?.length ?? 0,
			failed_tests: CombinedGroupByStatus?.failed?.length ?? 0,
			test_coverage: CombinedTestCoverage ?? 0,
			avg_test_duration: CombinedAvgTestDuration ?? 0,
			flaky_tests: CombinedFlakyTestsCount,
			graphs: {
				total_tests: [
					{
						id: 'years',
						data: jsonData?.drowser?.metrics?.graphs?.total_tests[0]
							.data as any ?? [],
					},
				],
				passing_tests:
					jsonData?.drowser?.metrics?.graphs?.passing_tests as any ?? [],
				failed_tests: jsonData?.drowser?.metrics?.graphs?.failed_tests as any ??
					[],
				test_coverage:
					jsonData?.drowser?.metrics?.graphs?.test_coverage as any ?? [],
				avg_test_duration: jsonData?.drowser?.metrics?.graphs
					?.avg_test_duration as any ?? [],
				flaky_tests: jsonData?.drowser?.metrics?.graphs
					?.flaky_tests as any ?? [],
			},
		}

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs?.total_tests[0]?.data as Array<
				Record<string, any>
			>,
			'x',
			{ x: month, y: totalTests.length },
			month,
		)

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs?.passing_tests as Array<
				Record<string, any>
			>,
			'name',
			{ name: month, count: groupByStatus?.passed?.length },
			month,
		)

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs?.failed_tests as Array<
				Record<string, any>
			>,
			'name',
			{ name: month, count: groupByStatus?.failed?.length },
			month,
		)

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs?.test_coverage as Array<
				Record<string, any>
			>,
			'name',
			{ name: month, count: getCoverage({ results: totalTests }) },
			month,
		)

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs?.avg_test_duration as Array<
				Record<string, any>
			>,
			'name',
			{ name: month, count: getAverageDuration({ results: totalTests }) },
			month,
		)

		updateOrCreate(
			jsonData?.drowser?.metrics?.graphs
				?.flaky_tests as Array<
					Record<string, any>
				>,
			'id',
			{ id: month, value: flakyTestsCount },
			month,
		)

		jsonData.drowser.cases.push({
			id: nanoid(),
			time: new Date().toISOString(),
			avg_duration: getAverageDuration({ results }),
			coverage: getCoverage({ results }),
			flaky: getFlaky({ results }),
			month_of_test: month,
			browser,
			cases: results,
		})

		writeJson(filePath, jsonData, { spaces: 2 })
			.catch((error) => {
				console.error('Error exporting JSON report:', error)
			})
	}
}

export { exportGeneratedLog, exportGeneratedPdf, exportJSONReport }
